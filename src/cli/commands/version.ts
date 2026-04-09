/**
 * Version command - show detailed version information
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { VersionInfo } from '../../types/common.js';

/**
 * Get detailed version information
 */
function getVersionInfo(): VersionInfo {
  let version = '0.0.0';

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '..', '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version: string };
    version = packageJson.version;
  } catch {
    // Use default
  }

  return {
    version,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * Create the version command
 */
export function versionCommand(): Command {
  const cmd = new Command('version');

  cmd
    .description('Show detailed version information')
    .option('--json', 'Output as JSON')
    .action((options: { json: boolean }) => {
      const info = getVersionInfo();

      if (options.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log('');
        console.log(chalk.cyan.bold('clawdRALPH'));
        console.log('');
        console.log(chalk.gray('  Version:  ') + chalk.white(info.version));
        console.log(chalk.gray('  Node.js:  ') + chalk.white(info.nodeVersion));
        console.log(chalk.gray('  Platform: ') + chalk.white(info.platform));
        console.log(chalk.gray('  Arch:     ') + chalk.white(info.arch));
        console.log('');
        console.log(chalk.gray('  The Autonomous Multi-Channel AI Development Agent'));
        console.log('');
      }
    });

  return cmd;
}
