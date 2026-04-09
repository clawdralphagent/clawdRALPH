/**
 * Channels command - manage messaging channels
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';
import { getConfig, saveConfig, loadConfig } from '../../config/loader.js';
import {
  getChannelManager,
  SignalChannel,
} from '../../channels/index.js';
import type { ChannelType } from '../../channels/types.js';

/**
 * Prompt user for input
 */
async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden) {
      // For hidden input (like tokens), we can't truly hide in basic readline
      // but we can warn the user
      process.stdout.write(question);
    }
    rl.question(hidden ? '' : question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for yes/no
 */
async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} (y/n): `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Create the channels command
 */
export function channelsCommand(): Command {
  const cmd = new Command('channels');

  cmd.description('Manage messaging channels (Telegram, Discord, Signal)');

  // channels list
  cmd
    .command('list')
    .description('List all configured channels')
    .action(() => {
      const config = getConfig();

      console.log('');
      console.log(chalk.cyan.bold('Configured Channels'));
      console.log('');

      // Telegram
      const tg = config.channels.telegram;
      console.log(chalk.white.bold('Telegram:'));
      console.log(chalk.gray('  Enabled:    ') + (tg.enabled ? chalk.green('yes') : chalk.gray('no')));
      console.log(chalk.gray('  Token:      ') + (tg.token ? chalk.green('configured') : chalk.yellow('not set')));
      console.log(chalk.gray('  DMs:        ') + (tg.allowDirectMessages ? chalk.green('allowed') : chalk.gray('blocked')));
      console.log(chalk.gray('  Groups:     ') + (tg.allowGroupMessages ? chalk.green('allowed') : chalk.gray('blocked')));
      console.log('');

      // Discord
      const dc = config.channels.discord;
      console.log(chalk.white.bold('Discord:'));
      console.log(chalk.gray('  Enabled:    ') + (dc.enabled ? chalk.green('yes') : chalk.gray('no')));
      console.log(chalk.gray('  Token:      ') + (dc.token ? chalk.green('configured') : chalk.yellow('not set')));
      console.log(chalk.gray('  DMs:        ') + (dc.allowDirectMessages ? chalk.green('allowed') : chalk.gray('blocked')));
      console.log(chalk.gray('  Servers:    ') + (dc.allowServerMessages ? chalk.green('allowed') : chalk.gray('blocked')));
      console.log('');

      // Signal
      const sg = config.channels.signal;
      console.log(chalk.white.bold('Signal:'));
      console.log(chalk.gray('  Enabled:    ') + (sg.enabled ? chalk.green('yes') : chalk.gray('no')));
      console.log(chalk.gray('  Phone:      ') + (sg.phoneNumber ? chalk.green(sg.phoneNumber) : chalk.yellow('not set')));
      console.log(chalk.gray('  DMs:        ') + (sg.allowDirectMessages ? chalk.green('allowed') : chalk.gray('blocked')));
      console.log(chalk.gray('  Groups:     ') + (sg.allowGroupMessages ? chalk.green('allowed') : chalk.gray('blocked')));
      console.log('');
    });

  // channels status
  cmd
    .command('status')
    .description('Show connection status of all channels')
    .action(async () => {
      const manager = getChannelManager();
      await manager.initializeChannels();

      const statuses = manager.getStatus();

      console.log('');
      console.log(chalk.cyan.bold('Channel Status'));
      console.log('');

      if (statuses.size === 0) {
        console.log(chalk.gray('No channels configured. Run `clawdralph channels setup` to configure.'));
        return;
      }

      for (const [type, status] of statuses) {
        const stateColor = status.state === 'connected' ? chalk.green :
                          status.state === 'connecting' ? chalk.yellow :
                          status.state === 'error' ? chalk.red :
                          chalk.gray;

        console.log(chalk.white.bold(`${type.charAt(0).toUpperCase() + type.slice(1)}:`));
        console.log(chalk.gray('  State:     ') + stateColor(status.state));

        if (status.connectedAt) {
          console.log(chalk.gray('  Connected: ') + chalk.white(status.connectedAt.toISOString()));
        }
        if (status.lastActivity) {
          console.log(chalk.gray('  Activity:  ') + chalk.white(status.lastActivity.toISOString()));
        }
        if (status.error) {
          console.log(chalk.gray('  Error:     ') + chalk.red(status.error));
        }
        if (Object.keys(status.metadata).length > 0) {
          for (const [key, value] of Object.entries(status.metadata)) {
            if (value !== undefined) {
              console.log(chalk.gray(`  ${key}: `) + chalk.white(String(value)));
            }
          }
        }
        console.log('');
      }
    });

  // channels connect
  cmd
    .command('connect [channel]')
    .description('Connect to a channel (or all if no channel specified)')
    .action(async (channel?: string) => {
      const manager = getChannelManager();
      await manager.initializeChannels();

      if (channel) {
        const type = channel.toLowerCase() as ChannelType;
        const spinner = ora(`Connecting to ${channel}...`).start();

        const success = await manager.connect(type);

        if (success) {
          spinner.succeed(chalk.green(`Connected to ${channel}`));
        } else {
          spinner.fail(chalk.red(`Failed to connect to ${channel}`));
        }
      } else {
        const spinner = ora('Connecting to all channels...').start();

        const results = await manager.connectAll();

        spinner.stop();

        for (const [type, success] of results) {
          if (success) {
            console.log(chalk.green(`  ✓ ${type} connected`));
          } else {
            console.log(chalk.red(`  ✗ ${type} failed`));
          }
        }
      }
    });

  // channels disconnect
  cmd
    .command('disconnect [channel]')
    .description('Disconnect from a channel (or all if no channel specified)')
    .action(async (channel?: string) => {
      const manager = getChannelManager();

      if (channel) {
        const type = channel.toLowerCase() as ChannelType;
        await manager.disconnect(type);
        console.log(chalk.green(`Disconnected from ${channel}`));
      } else {
        await manager.disconnectAll();
        console.log(chalk.green('Disconnected from all channels'));
      }
    });

  // channels setup
  cmd
    .command('setup [channel]')
    .description('Interactive setup wizard for a channel')
    .action(async (channel?: string) => {
      console.log('');
      console.log(chalk.cyan.bold('Channel Setup Wizard'));
      console.log('');

      if (!channel) {
        console.log('Available channels:');
        console.log('  1. telegram - Telegram bot');
        console.log('  2. discord  - Discord bot');
        console.log('  3. signal   - Signal messenger');
        console.log('');

        const choice = await prompt('Select channel (1-3 or name): ');
        channel = choice === '1' ? 'telegram' :
                  choice === '2' ? 'discord' :
                  choice === '3' ? 'signal' :
                  choice.toLowerCase();
      }

      switch (channel) {
        case 'telegram':
          await setupTelegram();
          break;
        case 'discord':
          await setupDiscord();
          break;
        case 'signal':
          await setupSignal();
          break;
        default:
          console.log(chalk.red(`Unknown channel: ${channel}`));
          console.log('Valid channels: telegram, discord, signal');
      }
    });

  // channels test
  cmd
    .command('test <channel>')
    .description('Test a channel by sending a test message')
    .option('-c, --chat <chatId>', 'Chat ID to send test message to')
    .action(async (channel: string, options: { chat?: string }) => {
      const type = channel.toLowerCase() as ChannelType;
      const manager = getChannelManager();
      await manager.initializeChannels();

      const spinner = ora(`Connecting to ${channel}...`).start();

      const connected = await manager.connect(type);
      if (!connected) {
        spinner.fail(chalk.red(`Failed to connect to ${channel}`));
        return;
      }

      spinner.text = 'Connected. Waiting for test message...';

      if (options.chat) {
        // Send test message
        const result = await manager.send(type, {
          chatId: options.chat,
          content: '👋 Hello from clawdRALPH! This is a test message.',
        });

        if (result.success) {
          spinner.succeed(chalk.green(`Test message sent to ${options.chat}`));
        } else {
          spinner.fail(chalk.red(`Failed to send: ${result.error}`));
        }
      } else {
        spinner.info('No chat ID provided. Send a message to the bot to test receiving.');
        console.log(chalk.gray('Press Ctrl+C to stop.'));

        // Listen for incoming messages
        manager.onMessage((message) => {
          console.log('');
          console.log(chalk.green('Message received:'));
          console.log(chalk.gray('  From:    ') + chalk.white(message.senderName));
          console.log(chalk.gray('  Chat:    ') + chalk.white(message.chatId));
          console.log(chalk.gray('  Content: ') + chalk.white(message.content));

          // Reply to the message
          void manager.reply(type, message.id, {
            chatId: message.chatId,
            content: '✅ Message received! clawdRALPH is working.',
          });
        });

        // Keep running
        await new Promise(() => {});
      }
    });

  return cmd;
}

/**
 * Telegram setup wizard
 */
async function setupTelegram(): Promise<void> {
  console.log(chalk.white.bold('Telegram Setup'));
  console.log('');
  console.log(chalk.gray('To create a Telegram bot:'));
  console.log(chalk.gray('1. Open Telegram and search for @BotFather'));
  console.log(chalk.gray('2. Send /newbot and follow the instructions'));
  console.log(chalk.gray('3. Copy the bot token provided'));
  console.log('');

  const token = await prompt('Enter bot token: ');

  if (!token) {
    console.log(chalk.yellow('Setup cancelled.'));
    return;
  }

  const allowDMs = await confirm('Allow direct messages?');
  const allowGroups = await confirm('Allow group messages?');
  const requireMention = allowGroups ? await confirm('Require @mention in groups?') : true;

  console.log('');
  console.log(chalk.gray('Optional: Add allowed users/groups (comma-separated IDs)'));
  const allowlistInput = await prompt('Allowlist (leave empty for all): ');
  const allowlist = allowlistInput ? allowlistInput.split(',').map((s) => s.trim()) : [];

  // Update config
  const configResult = loadConfig();
  if (configResult.success) {
    const config = configResult.data;
    config.channels.telegram = {
      ...config.channels.telegram,
      enabled: true,
      token,
      allowDirectMessages: allowDMs,
      allowGroupMessages: allowGroups,
      requireMention,
      allowlist,
    };

    const saveResult = saveConfig(config);
    if (saveResult.success) {
      console.log('');
      console.log(chalk.green('✓ Telegram configured successfully!'));
      console.log(chalk.gray('  Run `clawdralph channels test telegram` to verify.'));
    } else {
      console.log(chalk.red('Failed to save configuration.'));
    }
  }
}

/**
 * Discord setup wizard
 */
async function setupDiscord(): Promise<void> {
  console.log(chalk.white.bold('Discord Setup'));
  console.log('');
  console.log(chalk.gray('To create a Discord bot:'));
  console.log(chalk.gray('1. Go to https://discord.com/developers/applications'));
  console.log(chalk.gray('2. Click "New Application" and give it a name'));
  console.log(chalk.gray('3. Go to "Bot" section and click "Add Bot"'));
  console.log(chalk.gray('4. Copy the bot token'));
  console.log(chalk.gray('5. Enable "Message Content Intent" under Privileged Gateway Intents'));
  console.log(chalk.gray('6. Go to OAuth2 > URL Generator, select "bot" scope'));
  console.log(chalk.gray('7. Select permissions: Send Messages, Read Message History'));
  console.log(chalk.gray('8. Use the generated URL to invite the bot to your server'));
  console.log('');

  const token = await prompt('Enter bot token: ');

  if (!token) {
    console.log(chalk.yellow('Setup cancelled.'));
    return;
  }

  const applicationId = await prompt('Enter application ID (optional): ');
  const allowDMs = await confirm('Allow direct messages?');
  const allowServers = await confirm('Allow server messages?');
  const requireMention = allowServers ? await confirm('Require @mention in servers?') : true;

  console.log('');
  console.log(chalk.gray('Optional: Add allowed users/servers/channels (comma-separated IDs)'));
  const allowlistInput = await prompt('Allowlist (leave empty for all): ');
  const allowlist = allowlistInput ? allowlistInput.split(',').map((s) => s.trim()) : [];

  // Update config
  const configResult = loadConfig();
  if (configResult.success) {
    const config = configResult.data;
    config.channels.discord = {
      ...config.channels.discord,
      enabled: true,
      token,
      applicationId: applicationId || undefined,
      allowDirectMessages: allowDMs,
      allowServerMessages: allowServers,
      requireMention,
      allowlist,
    };

    const saveResult = saveConfig(config);
    if (saveResult.success) {
      console.log('');
      console.log(chalk.green('✓ Discord configured successfully!'));
      console.log(chalk.gray('  Run `clawdralph channels test discord` to verify.'));
    } else {
      console.log(chalk.red('Failed to save configuration.'));
    }
  }
}

/**
 * Signal setup wizard
 */
async function setupSignal(): Promise<void> {
  console.log(chalk.white.bold('Signal Setup'));
  console.log('');
  console.log(chalk.gray('Signal requires signal-cli to be installed.'));
  console.log(chalk.gray('Installation: https://github.com/AsamK/signal-cli'));
  console.log('');

  // Check if signal-cli is available
  const spinner = ora('Checking for signal-cli...').start();
  const isAvailable = await SignalChannel.isAvailable();

  if (!isAvailable) {
    spinner.fail(chalk.red('signal-cli not found'));
    console.log('');
    console.log(chalk.yellow('Please install signal-cli first:'));
    console.log(chalk.gray('  brew install signal-cli  (macOS)'));
    console.log(chalk.gray('  apt install signal-cli   (Debian/Ubuntu)'));
    console.log(chalk.gray('  Or download from: https://github.com/AsamK/signal-cli/releases'));
    return;
  }

  spinner.succeed('signal-cli found');
  console.log('');

  const phoneNumber = await prompt('Enter your Signal phone number (e.g., +1234567890): ');

  if (!phoneNumber) {
    console.log(chalk.yellow('Setup cancelled.'));
    return;
  }

  console.log('');
  console.log(chalk.gray('Is this number already linked to signal-cli?'));
  const alreadyLinked = await confirm('Already linked?');

  if (!alreadyLinked) {
    console.log('');
    console.log(chalk.yellow('You need to link your phone number first.'));
    console.log(chalk.gray('Run: signal-cli link -n "clawdRALPH"'));
    console.log(chalk.gray('Then scan the QR code with your Signal app.'));
    console.log('');

    const wantLink = await confirm('Would you like to try linking now?');

    if (wantLink) {
      console.log('');
      console.log(chalk.gray('Starting link process... Scan the QR code with your Signal app.'));

      try {
        const linkSpinner = ora('Waiting for link...').start();
        const linkUrl = await SignalChannel.link(phoneNumber, 'clawdRALPH');

        linkSpinner.info('Scan this link with your Signal app:');
        console.log('');
        console.log(chalk.cyan(linkUrl));
        console.log('');

        // Note: The actual linking happens in the background
        // User needs to scan and approve
        console.log(chalk.gray('After scanning, press Enter to continue...'));
        await prompt('');
      } catch (error) {
        console.log(chalk.red('Link process failed. Please link manually using signal-cli.'));
        return;
      }
    } else {
      console.log(chalk.gray('Please link manually and run setup again.'));
      return;
    }
  }

  const allowDMs = await confirm('Allow direct messages?');
  const allowGroups = await confirm('Allow group messages?');

  console.log('');
  console.log(chalk.gray('Optional: Add allowed phone numbers/groups (comma-separated)'));
  const allowlistInput = await prompt('Allowlist (leave empty for all): ');
  const allowlist = allowlistInput ? allowlistInput.split(',').map((s) => s.trim()) : [];

  // Update config
  const configResult = loadConfig();
  if (configResult.success) {
    const config = configResult.data;
    config.channels.signal = {
      ...config.channels.signal,
      enabled: true,
      phoneNumber,
      allowDirectMessages: allowDMs,
      allowGroupMessages: allowGroups,
      allowlist,
    };

    const saveResult = saveConfig(config);
    if (saveResult.success) {
      console.log('');
      console.log(chalk.green('✓ Signal configured successfully!'));
      console.log(chalk.gray('  Run `clawdralph channels test signal` to verify.'));
    } else {
      console.log(chalk.red('Failed to save configuration.'));
    }
  }
}
