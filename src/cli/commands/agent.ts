/**
 * Agent CLI commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { createAgent } from '../../ai/agent.js';
import type { AIProviderType } from '../../ai/types.js';

/**
 * Create the agent command group
 */
export function createAgentCommand(): Command {
  const command = new Command('agent')
    .description('AI agent commands');

  // Chat subcommand - interactive chat
  command
    .command('chat')
    .description('Start an interactive chat session')
    .option('-p, --provider <provider>', 'AI provider (anthropic, openai, ollama)', 'anthropic')
    .option('-m, --model <model>', 'Model to use')
    .option('-s, --system <prompt>', 'System prompt')
    .action(async (options) => {
      await interactiveChat(options);
    });

  // Complete subcommand - one-shot completion
  command
    .command('complete <prompt>')
    .description('Get a one-shot completion')
    .option('-p, --provider <provider>', 'AI provider (anthropic, openai, ollama)', 'anthropic')
    .option('-m, --model <model>', 'Model to use')
    .option('-s, --system <prompt>', 'System prompt')
    .option('--json', 'Output as JSON')
    .action(async (prompt: string, options) => {
      await oneShot(prompt, options);
    });

  // Providers subcommand
  command
    .command('providers')
    .description('List available AI providers and their status')
    .action(async () => {
      await listProviders();
    });

  // Tools subcommand
  command
    .command('tools')
    .description('List available tools')
    .action(async () => {
      await listTools();
    });

  // Models subcommand
  command
    .command('models')
    .description('List models for a provider')
    .option('-p, --provider <provider>', 'AI provider (anthropic, openai, ollama)', 'anthropic')
    .action(async (options) => {
      await listModels(options.provider);
    });

  return command;
}

/**
 * Interactive chat session
 */
async function interactiveChat(options: {
  provider: string;
  model?: string;
  system?: string;
}): Promise<void> {
  console.log(chalk.cyan('\n=== ClawdRALPH Interactive Chat ===\n'));

  const spinner = ora('Initializing agent...').start();

  try {
    const agent = createAgent({
      defaultProvider: options.provider as AIProviderType,
      defaultModel: options.model,
      systemPrompt: options.system,
    });

    // Check provider availability
    const provider = agent.getProvider();
    const available = await provider.isAvailable();

    if (!available) {
      spinner.fail(`Provider ${options.provider} is not available. Check your API key.`);
      return;
    }

    spinner.succeed(`Connected to ${options.provider}`);

    // Create conversation
    const conversation = agent.createConversation();
    console.log(chalk.gray(`Conversation ID: ${conversation.id}\n`));
    console.log(chalk.gray('Type "exit" or "quit" to end the session'));
    console.log(chalk.gray('Type "clear" to start a new conversation'));
    console.log(chalk.gray('Type "tools" to list available tools\n'));

    // Setup readline
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = (): void => {
      rl.question(chalk.green('You: '), async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
          prompt();
          return;
        }

        if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
          console.log(chalk.cyan('\nGoodbye!\n'));
          rl.close();
          return;
        }

        if (trimmed.toLowerCase() === 'clear') {
          agent.deleteConversation(conversation.id);
          const newConv = agent.createConversation(undefined, options.system);
          console.log(chalk.gray(`\nNew conversation: ${newConv.id}\n`));
          prompt();
          return;
        }

        if (trimmed.toLowerCase() === 'tools') {
          const tools = agent.getToolRegistry().list();
          console.log(chalk.cyan('\nAvailable Tools:'));
          for (const tool of tools) {
            const status = tool.enabled ? chalk.green('enabled') : chalk.red('disabled');
            console.log(`  - ${tool.name}: ${tool.description} [${status}]`);
          }
          console.log('');
          prompt();
          return;
        }

        // Stream response
        process.stdout.write(chalk.blue('\nAssistant: '));

        try {
          for await (const chunk of agent.streamChat(conversation.id, trimmed)) {
            if (chunk.type === 'content' && chunk.content) {
              process.stdout.write(chunk.content);
            } else if (chunk.type === 'tool_start') {
              process.stdout.write(chalk.yellow(`\n[Using tool: ${chunk.toolName}]`));
            } else if (chunk.type === 'tool_end') {
              process.stdout.write(chalk.yellow(` [Done]\n`));
            }
          }
          console.log('\n');
        } catch (error) {
          console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`));
        }

        prompt();
      });
    };

    prompt();
  } catch (error) {
    spinner.fail(`Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * One-shot completion
 */
async function oneShot(
  prompt: string,
  options: {
    provider: string;
    model?: string;
    system?: string;
    json?: boolean;
  }
): Promise<void> {
  const spinner = ora('Thinking...').start();

  try {
    const agent = createAgent({
      defaultProvider: options.provider as AIProviderType,
      defaultModel: options.model,
      systemPrompt: options.system,
    });

    const response = await agent.complete(prompt, {
      model: options.model,
      systemPrompt: options.system,
    });

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify({ response, provider: options.provider }));
    } else {
      console.log('\n' + response + '\n');
    }
  } catch (error) {
    spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * List available providers
 */
async function listProviders(): Promise<void> {
  const spinner = ora('Checking providers...').start();

  try {
    const agent = createAgent();
    const status = await agent.getProviderStatus();

    spinner.stop();

    console.log(chalk.cyan('\n=== AI Providers ===\n'));

    for (const provider of status) {
      const statusIcon = provider.available
        ? chalk.green('✓')
        : chalk.red('✗');

      console.log(`${statusIcon} ${chalk.bold(provider.type)}`);

      if (provider.available && provider.models.length > 0) {
        console.log(chalk.gray(`   Models: ${provider.models.slice(0, 5).join(', ')}${provider.models.length > 5 ? '...' : ''}`));
      } else if (!provider.available) {
        console.log(chalk.gray('   Not configured or unavailable'));
      }
    }

    console.log('');
  } catch (error) {
    spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List available tools
 */
async function listTools(): Promise<void> {
  const agent = createAgent();
  const tools = agent.getToolRegistry().list();

  console.log(chalk.cyan('\n=== Available Tools ===\n'));

  for (const tool of tools) {
    const status = tool.enabled
      ? chalk.green('[enabled]')
      : chalk.red('[disabled]');

    console.log(`${chalk.bold(tool.name)} ${status}`);
    console.log(chalk.gray(`   ${tool.description}`));
  }

  console.log('');
}

/**
 * List models for a provider
 */
async function listModels(providerType: string): Promise<void> {
  const spinner = ora(`Fetching models for ${providerType}...`).start();

  try {
    const agent = createAgent({
      defaultProvider: providerType as AIProviderType,
    });

    const provider = agent.getProvider();
    const available = await provider.isAvailable();

    if (!available) {
      spinner.fail(`Provider ${providerType} is not available`);
      return;
    }

    const models = await provider.listModels();

    spinner.stop();

    console.log(chalk.cyan(`\n=== Models for ${providerType} ===\n`));

    if (models.length === 0) {
      console.log(chalk.gray('No models available'));
    } else {
      for (const model of models) {
        console.log(`  - ${model}`);
      }
    }

    console.log('');
  } catch (error) {
    spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
