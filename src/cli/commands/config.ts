/**
 * Config command - manage configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import JSON5 from 'json5';
import {
  getConfig,
  getConfigMetadata,
  initConfig,
  loadConfig,
  saveConfig,
} from '../../config/loader.js';
import { getConfigPath } from '../../utils/paths.js';
import { createLogger } from '../../logging/logger.js';

const log = createLogger('config');

/**
 * Create the config command
 */
export function configCommand(): Command {
  const cmd = new Command('config');

  cmd.description('Manage clawdRALPH configuration');

  // config init
  cmd
    .command('init')
    .description('Initialize a new configuration file')
    .option('-p, --path <path>', 'Path for the configuration file')
    .option('-f, --force', 'Overwrite existing configuration', false)
    .action((options: { path?: string; force: boolean }) => {
      const path = options.path ?? getConfigPath();

      if (options.force) {
        // Delete existing and reinit
        const result = initConfig(path);
        if (result.success) {
          console.log(chalk.green(`Configuration file created: ${path}`));
        } else {
          console.error(chalk.red(`Failed to create configuration: ${result.error.message}`));
          process.exit(1);
        }
      } else {
        const result = initConfig(path);
        if (result.success) {
          console.log(chalk.green(`Configuration file created: ${path}`));
        } else {
          console.error(chalk.red(result.error.message));
          process.exit(1);
        }
      }
    });

  // config show
  cmd
    .command('show')
    .description('Display current configuration')
    .option('--json', 'Output as JSON')
    .action((options: { json: boolean }) => {
      try {
        const config = getConfig();
        const metadata = getConfigMetadata();

        if (options.json) {
          console.log(JSON.stringify(config, null, 2));
        } else {
          console.log(chalk.cyan('Configuration:'));
          console.log('');
          console.log(JSON5.stringify(config, null, 2));
          console.log('');
          if (metadata) {
            console.log(chalk.gray(`Source: ${metadata.isDefault ? 'defaults' : metadata.path}`));
            console.log(chalk.gray(`Loaded: ${metadata.lastLoaded.toISOString()}`));
          }
        }
      } catch (error) {
        console.error(chalk.red('Failed to load configuration'));
        log.error('Config show failed', error);
        process.exit(1);
      }
    });

  // config get
  cmd
    .command('get <key>')
    .description('Get a specific configuration value')
    .action((key: string) => {
      try {
        const config = getConfig();
        const keys = key.split('.');
        let value: unknown = config;

        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else {
            console.error(chalk.red(`Configuration key not found: ${key}`));
            process.exit(1);
          }
        }

        if (typeof value === 'object') {
          console.log(JSON5.stringify(value, null, 2));
        } else {
          console.log(String(value));
        }
      } catch (error) {
        console.error(chalk.red('Failed to get configuration value'));
        log.error('Config get failed', error);
        process.exit(1);
      }
    });

  // config set
  cmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      try {
        const config = getConfig();
        const keys = key.split('.');
        let target: Record<string, unknown> = config as unknown as Record<string, unknown>;

        // Navigate to parent
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (k && target[k] && typeof target[k] === 'object') {
            target = target[k] as Record<string, unknown>;
          } else {
            console.error(chalk.red(`Configuration key not found: ${key}`));
            process.exit(1);
          }
        }

        // Parse value
        let parsedValue: unknown;
        try {
          parsedValue = JSON5.parse(value);
        } catch {
          parsedValue = value;
        }

        // Set value
        const lastKey = keys[keys.length - 1];
        if (lastKey) {
          target[lastKey] = parsedValue;
        }

        // Save
        const result = saveConfig(config);
        if (result.success) {
          console.log(chalk.green(`Set ${key} = ${JSON5.stringify(parsedValue)}`));
        } else {
          console.error(chalk.red(`Failed to save configuration: ${result.error.message}`));
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Failed to set configuration value'));
        log.error('Config set failed', error);
        process.exit(1);
      }
    });

  // config validate
  cmd
    .command('validate')
    .description('Validate the configuration file')
    .option('-p, --path <path>', 'Path to configuration file')
    .action((options: { path?: string }) => {
      const result = loadConfig(options.path);

      if (result.success) {
        console.log(chalk.green('Configuration is valid'));
      } else {
        console.error(chalk.red('Configuration validation failed:'));
        console.error(chalk.yellow(result.error.message));
        process.exit(1);
      }
    });

  // config path
  cmd
    .command('path')
    .description('Show the configuration file path')
    .action(() => {
      const metadata = getConfigMetadata();
      if (metadata) {
        console.log(metadata.path);
      } else {
        console.log(getConfigPath());
      }
    });

  return cmd;
}
