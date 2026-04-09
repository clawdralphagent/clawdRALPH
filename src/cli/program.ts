/**
 * CLI program builder using Commander.js
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { CLIContext } from '../types/common.js';
import { loadConfig } from '../config/loader.js';
import { initLogger, getLogger } from '../logging/logger.js';
import { loadEnv } from '../utils/env.js';
import { getConfigPath } from '../utils/paths.js';

// Import commands
import { gatewayCommand } from './commands/gateway.js';
import { configCommand } from './commands/config.js';
import { loopCommand } from './commands/loop.js';
import { prdCommand } from './commands/prd.js';
import { statusCommand } from './commands/status.js';
import { versionCommand } from './commands/version.js';
import { sessionsCommand } from './commands/sessions.js';
import { channelsCommand } from './commands/channels.js';
import { createAgentCommand } from './commands/agent.js';
import { createBrowserCommand } from './commands/browser.js';
import { memoryCommand } from './commands/memory.js';
import { skillsCommand } from './commands/skills.js';
import { buildDashboardCommand } from './commands/dashboard.js';

/**
 * Get package version from package.json
 */
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version: string };
    return packageJson.version;
  } catch {
    return '0.0.0';
  }
}

/**
 * Build the CLI program
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('clawdralph')
    .description('The Autonomous Multi-Channel AI Development Agent')
    .version(getPackageVersion(), '-v, --version', 'Display version number')
    .option('-c, --config <path>', 'Path to configuration file', getConfigPath())
    .option('--verbose', 'Enable verbose output', false)
    .option('-q, --quiet', 'Suppress non-essential output', false)
    .option('--no-color', 'Disable colored output')
    .hook('preAction', async (thisCommand) => {
      // Load environment variables
      loadEnv();

      // Get global options
      const opts = thisCommand.opts() as CLIContext;

      // Initialize configuration
      const configResult = loadConfig(opts.configPath);
      if (!configResult.success) {
        if (!opts.quiet) {
          console.error(chalk.yellow('Warning: Failed to load configuration, using defaults'));
          console.error(chalk.gray(configResult.error.message));
        }
      }

      // Initialize logger
      const config = configResult.success ? configResult.data : undefined;
      initLogger({
        level: opts.verbose ? 'debug' : config?.logging.level ?? 'info',
        file: config?.logging.file,
        json: config?.logging.json,
      });

      // Disable colors if requested
      if (opts.noColor) {
        chalk.level = 0;
      }
    });

  // Add commands
  program.addCommand(gatewayCommand());
  program.addCommand(configCommand());
  program.addCommand(loopCommand());
  program.addCommand(prdCommand());
  program.addCommand(sessionsCommand());
  program.addCommand(channelsCommand());
  program.addCommand(createAgentCommand());
  program.addCommand(createBrowserCommand());
  program.addCommand(memoryCommand());
  program.addCommand(skillsCommand());
  program.addCommand(buildDashboardCommand());
  program.addCommand(statusCommand());
  program.addCommand(versionCommand());

  // Default action (no command)
  program.action(() => {
    program.outputHelp();
  });

  // Error handling
  program.exitOverride((err) => {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    }
    getLogger().error('CLI error', err);
    process.exit(1);
  });

  return program;
}

/**
 * Run the CLI program
 */
export async function runProgram(args: string[] = process.argv): Promise<void> {
  const program = buildProgram();

  try {
    await program.parseAsync(args);
  } catch (error) {
    getLogger().error('Unexpected error', error);
    process.exit(1);
  }
}
