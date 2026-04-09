/**
 * Gateway command - starts the WebSocket gateway server
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../../config/loader.js';
import { createLogger } from '../../logging/logger.js';
import { setupShutdownHandlers } from '../shutdown.js';
import { startGatewayServer, stopGatewayServer } from '../../gateway/server.js';
import { getAuthManager } from '../../gateway/auth.js';

const log = createLogger('gateway-cmd');

/**
 * Create the gateway command
 */
export function gatewayCommand(): Command {
  const cmd = new Command('gateway');

  cmd
    .description('Start the clawdRALPH gateway server')
    .option('-p, --port <number>', 'Port to listen on')
    .option('-b, --bind <address>', 'Address to bind to')
    .option('--no-auth', 'Disable authentication')
    .option('-t, --token <token>', 'Admin authentication token')
    .action(async (options: { port?: string; bind?: string; auth: boolean; token?: string }) => {
      const config = getConfig();

      const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
      const bind = options.bind ?? config.gateway.bind;
      const enableAuth = options.auth && config.gateway.enableAuth;
      const authToken = options.token ?? config.gateway.authToken;

      const spinner = ora('Starting gateway server...').start();

      try {
        // Setup shutdown handlers
        setupShutdownHandlers(async () => {
          spinner.info('Shutting down gateway...');
          await stopGatewayServer();
        });

        // Start the gateway server
        await startGatewayServer({
          port,
          bind,
          enableAuth,
          authToken,
        });

        spinner.succeed(chalk.green(`Gateway server started on ${bind}:${port}`));

        log.info('Gateway started', { port, bind, auth: enableAuth });

        console.log('');
        console.log(chalk.cyan('Gateway is running. Press Ctrl+C to stop.'));
        console.log('');
        console.log(chalk.gray('  WebSocket: ') + chalk.white(`ws://${bind}:${port}`));
        console.log(chalk.gray('  HTTP API:  ') + chalk.white(`http://${bind}:${port}`));
        console.log(chalk.gray('  Auth:      ') + chalk.white(enableAuth ? 'enabled' : 'disabled'));
        console.log('');
        console.log(chalk.gray('Endpoints:'));
        console.log(chalk.gray('  GET /health  - Health check'));
        console.log(chalk.gray('  GET /stats   - Server statistics'));
        console.log(chalk.gray('  GET /clients - Connected clients'));
        console.log(chalk.gray('  GET /sessions - Active sessions'));
        console.log('');

        if (enableAuth && authToken) {
          console.log(chalk.yellow('Admin token configured. Keep it secure!'));
          console.log('');
        }

        // Keep process running
        await new Promise(() => {
          // This promise never resolves - process runs until interrupted
        });
      } catch (error) {
        spinner.fail(chalk.red('Failed to start gateway'));
        log.error('Gateway startup failed', error);
        process.exit(1);
      }
    });

  // Gateway status subcommand
  cmd
    .command('status')
    .description('Check gateway server status')
    .option('-u, --url <url>', 'Gateway URL', 'http://127.0.0.1:18789')
    .action(async (options: { url: string }) => {
      try {
        const response = await fetch(`${options.url}/health`);

        if (response.ok) {
          const data = await response.json() as { status: string; version: string };
          console.log(chalk.green('Gateway is running'));
          console.log(chalk.gray('  Status:  ') + chalk.white(data.status));
          console.log(chalk.gray('  Version: ') + chalk.white(data.version));

          // Get stats
          const statsResponse = await fetch(`${options.url}/stats`);
          if (statsResponse.ok) {
            const stats = await statsResponse.json() as {
              uptime: number;
              connections: { total: number; authenticated: number };
              sessions: { active: number; total: number };
              messages: { received: number; sent: number };
            };
            console.log('');
            console.log(chalk.gray('  Uptime:      ') + chalk.white(`${Math.floor(stats.uptime / 1000)}s`));
            console.log(chalk.gray('  Connections: ') + chalk.white(`${stats.connections.total} (${stats.connections.authenticated} authenticated)`));
            console.log(chalk.gray('  Sessions:    ') + chalk.white(`${stats.sessions.active} active / ${stats.sessions.total} total`));
            console.log(chalk.gray('  Messages:    ') + chalk.white(`${stats.messages.received} received, ${stats.messages.sent} sent`));
          }
        } else {
          console.log(chalk.red('Gateway returned error: ' + response.status));
        }
      } catch {
        console.log(chalk.yellow('Gateway is not running or not reachable'));
        console.log(chalk.gray(`  URL: ${options.url}`));
      }
    });

  // Generate token subcommand
  cmd
    .command('token')
    .description('Generate a new authentication token')
    .action(() => {
      const token = getAuthManager().generateToken();
      console.log(chalk.cyan('Generated authentication token:'));
      console.log('');
      console.log(chalk.white(token));
      console.log('');
      console.log(chalk.gray('Add this token to your config or use --token flag'));
    });

  return cmd;
}
