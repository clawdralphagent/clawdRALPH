/**
 * Status command - show overall system status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, getConfigMetadata } from '../../config/loader.js';
import { createLogger } from '../../logging/logger.js';

const log = createLogger('status');

/**
 * Check if gateway is running
 */
async function checkGatewayStatus(url: string): Promise<{ running: boolean; stats?: unknown }> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const statsResponse = await fetch(`${url}/stats`, { signal: AbortSignal.timeout(2000) });
      const stats = statsResponse.ok ? await statsResponse.json() : undefined;
      return { running: true, stats };
    }
    return { running: false };
  } catch {
    return { running: false };
  }
}

/**
 * Create the status command
 */
export function statusCommand(): Command {
  const cmd = new Command('status');

  cmd
    .description('Show clawdRALPH system status')
    .option('--json', 'Output as JSON')
    .action(async (options: { json: boolean }) => {
      try {
        const config = getConfig();
        const metadata = getConfigMetadata();

        const gatewayUrl = `http://${config.gateway.bind}:${config.gateway.port}`;
        const gatewayStatus = await checkGatewayStatus(gatewayUrl);

        const status = {
          version: process.env['npm_package_version'] ?? '0.1.0',
          node: process.version,
          platform: process.platform,
          config: {
            path: metadata?.path ?? 'defaults',
            isDefault: metadata?.isDefault ?? true,
          },
          gateway: {
            running: gatewayStatus.running,
            port: config.gateway.port,
            bind: config.gateway.bind,
            ...(gatewayStatus.stats as object ?? {}),
          },
          loop: {
            active: false, // TODO: Check actual loop status from gateway
            iteration: 0,
            maxIterations: config.ralph.maxIterations,
          },
          channels: {
            telegram: config.channels.telegram.enabled,
            slack: config.channels.slack.enabled,
            discord: config.channels.discord.enabled,
            whatsapp: config.channels.whatsapp.enabled,
          },
          model: config.models.primary,
        };

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          console.log('');
          console.log(chalk.cyan.bold('clawdRALPH Status'));
          console.log('');

          // System info
          console.log(chalk.white.bold('System:'));
          console.log(chalk.gray('  Version:  ') + chalk.white(status.version));
          console.log(chalk.gray('  Node:     ') + chalk.white(status.node));
          console.log(chalk.gray('  Platform: ') + chalk.white(status.platform));
          console.log('');

          // Configuration
          console.log(chalk.white.bold('Configuration:'));
          console.log(
            chalk.gray('  Source: ') +
              chalk.white(status.config.isDefault ? 'defaults' : status.config.path)
          );
          console.log('');

          // Gateway
          console.log(chalk.white.bold('Gateway:'));
          console.log(
            chalk.gray('  Status:  ') +
              (status.gateway.running ? chalk.green('running') : chalk.yellow('stopped'))
          );
          console.log(
            chalk.gray('  Address: ') + chalk.white(`${status.gateway.bind}:${status.gateway.port}`)
          );

          if (gatewayStatus.running && gatewayStatus.stats) {
            const stats = gatewayStatus.stats as {
              uptime?: number;
              connections?: { total: number; authenticated: number };
              sessions?: { active: number; total: number };
            };
            if (stats.uptime !== undefined) {
              console.log(chalk.gray('  Uptime:  ') + chalk.white(`${Math.floor(stats.uptime / 1000)}s`));
            }
            if (stats.connections) {
              console.log(
                chalk.gray('  Clients: ') +
                  chalk.white(`${stats.connections.total} (${stats.connections.authenticated} authenticated)`)
              );
            }
            if (stats.sessions) {
              console.log(
                chalk.gray('  Sessions:') +
                  chalk.white(` ${stats.sessions.active} active / ${stats.sessions.total} total`)
              );
            }
          }
          console.log('');

          // Loop
          console.log(chalk.white.bold('Development Loop:'));
          console.log(
            chalk.gray('  Status: ') +
              (status.loop.active ? chalk.green('active') : chalk.gray('inactive'))
          );
          if (status.loop.active) {
            console.log(
              chalk.gray('  Progress: ') +
                chalk.white(`${status.loop.iteration}/${status.loop.maxIterations}`)
            );
          }
          console.log('');

          // Channels
          console.log(chalk.white.bold('Channels:'));
          const channelStatus = (enabled: boolean) =>
            enabled ? chalk.green('enabled') : chalk.gray('disabled');
          console.log(chalk.gray('  Telegram: ') + channelStatus(status.channels.telegram));
          console.log(chalk.gray('  Slack:    ') + channelStatus(status.channels.slack));
          console.log(chalk.gray('  Discord:  ') + channelStatus(status.channels.discord));
          console.log(chalk.gray('  WhatsApp: ') + channelStatus(status.channels.whatsapp));
          console.log('');

          // Model
          console.log(chalk.white.bold('AI Model:'));
          console.log(chalk.gray('  Primary: ') + chalk.white(status.model));
          console.log('');
        }

        log.debug('Status displayed');
      } catch (error) {
        console.error(chalk.red('Failed to get status'));
        log.error('Status command failed', error);
        process.exit(1);
      }
    });

  return cmd;
}
