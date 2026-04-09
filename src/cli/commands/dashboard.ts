/**
 * Dashboard CLI command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../../logging/logger.js';
import { getConfig } from '../../config/loader.js';
import { getGatewayServer } from '../../gateway/server.js';

const log = createLogger('dashboard');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the web directory path
 */
function getWebDir(): string {
  // Check for various possible locations
  const possiblePaths = [
    resolve(__dirname, '../../../web'),
    resolve(__dirname, '../../web'),
    resolve(process.cwd(), 'web'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(resolve(p, 'package.json'))) {
      return p;
    }
  }

  return possiblePaths[0] ?? resolve(process.cwd(), 'web');
}

/**
 * Build the dashboard command
 */
export function buildDashboardCommand(): Command {
  const cmd = new Command('dashboard');

  cmd.description('Web dashboard management');

  // Start dashboard dev server
  cmd
    .command('dev')
    .description('Start the dashboard development server')
    .option('-p, --port <port>', 'Port to run the dev server on', '3000')
    .action(async (options) => {
      const webDir = getWebDir();
      const config = getConfig();

      if (!existsSync(resolve(webDir, 'package.json'))) {
        console.log(chalk.red('Web dashboard not found.'));
        console.log(chalk.gray(`Expected at: ${webDir}`));
        console.log(chalk.gray('\nTo set up the dashboard, run:'));
        console.log(chalk.cyan('  cd web && npm install'));
        return;
      }

      console.log(chalk.blue('Starting dashboard development server...'));
      console.log(chalk.gray(`Gateway: http://127.0.0.1:${config.gateway.port}`));
      console.log(chalk.gray(`Dashboard: http://localhost:${options.port}`));
      console.log();

      // Check if node_modules exists
      if (!existsSync(resolve(webDir, 'node_modules'))) {
        console.log(chalk.yellow('Installing dashboard dependencies...'));
        const install = spawn('npm', ['install'], {
          cwd: webDir,
          stdio: 'inherit',
          shell: true,
        });
        await new Promise<void>((resolve, reject) => {
          install.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`npm install failed with code ${code}`));
          });
        });
      }

      // Start vite dev server
      const vite = spawn('npm', ['run', 'dev', '--', '--port', options.port], {
        cwd: webDir,
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          VITE_GATEWAY_PORT: String(config.gateway.port),
        },
      });

      // Handle termination
      process.on('SIGINT', () => {
        vite.kill('SIGINT');
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        vite.kill('SIGTERM');
        process.exit(0);
      });

      await new Promise<void>((resolve) => {
        vite.on('close', () => resolve());
      });
    });

  // Build dashboard for production
  cmd
    .command('build')
    .description('Build the dashboard for production')
    .action(async () => {
      const webDir = getWebDir();

      if (!existsSync(resolve(webDir, 'package.json'))) {
        console.log(chalk.red('Web dashboard not found.'));
        return;
      }

      const spinner = ora('Building dashboard...').start();

      try {
        // Install deps if needed
        if (!existsSync(resolve(webDir, 'node_modules'))) {
          spinner.text = 'Installing dependencies...';
          await new Promise<void>((resolve, reject) => {
            const install = spawn('npm', ['install'], {
              cwd: webDir,
              stdio: 'pipe',
              shell: true,
            });
            install.on('close', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`npm install failed`));
            });
          });
        }

        spinner.text = 'Building dashboard...';
        await new Promise<void>((resolve, reject) => {
          const build = spawn('npm', ['run', 'build'], {
            cwd: webDir,
            stdio: 'pipe',
            shell: true,
          });
          build.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Build failed`));
          });
        });

        spinner.succeed('Dashboard built successfully');
        console.log(chalk.gray(`Output: ${resolve(webDir, 'dist')}`));
      } catch (error) {
        spinner.fail('Failed to build dashboard');
        log.error('Build error', error);
      }
    });

  // Show dashboard status
  cmd
    .command('status')
    .description('Show dashboard status')
    .action(async () => {
      const webDir = getWebDir();
      const config = getConfig();

      console.log(chalk.bold('\nDashboard Status\n'));

      // Check web directory
      const hasWebDir = existsSync(resolve(webDir, 'package.json'));
      console.log(`  Web directory:     ${hasWebDir ? chalk.green('Found') : chalk.red('Not found')}`);
      console.log(`    Path:            ${chalk.gray(webDir)}`);

      // Check dependencies
      const hasDeps = existsSync(resolve(webDir, 'node_modules'));
      console.log(`  Dependencies:      ${hasDeps ? chalk.green('Installed') : chalk.yellow('Not installed')}`);

      // Check build
      const hasBuild = existsSync(resolve(webDir, 'dist'));
      console.log(`  Production build:  ${hasBuild ? chalk.green('Available') : chalk.gray('Not built')}`);

      // Gateway status
      const gateway = getGatewayServer();
      const isRunning = gateway.isServerRunning();
      console.log(`  Gateway:           ${isRunning ? chalk.green('Running') : chalk.gray('Stopped')}`);
      console.log(`    URL:             ${chalk.cyan(`http://127.0.0.1:${config.gateway.port}`)}`);

      console.log();
    });

  return cmd;
}
