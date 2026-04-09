/**
 * Browser CLI commands
 * Commands for browser automation, screenshots, and verification
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import {
  getBrowserManager,
  createPageController,
  createUIVerifier,
  createDevServerManager,
  detectRunningDevServer,
} from '../../browser/index.js';
import type { BrowserConfig, DevServerConfig } from '../../browser/index.js';

/**
 * Create browser command
 */
export function createBrowserCommand(): Command {
  const browser = new Command('browser')
    .description('Browser automation and verification commands');

  // browser open <url>
  browser
    .command('open')
    .description('Open a URL in the browser')
    .argument('<url>', 'URL to open')
    .option('-h, --headed', 'Run in headed mode (visible browser)')
    .option('-b, --browser <type>', 'Browser type: chromium, firefox, webkit', 'chromium')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds', '60000')
    .action(async (url: string, options) => {
      const spinner = ora('Launching browser...').start();

      try {
        const manager = getBrowserManager();

        const config: Partial<BrowserConfig> = {
          mode: options.headed ? 'headed' : 'headless',
          browserType: options.browser,
        };

        spinner.text = `Launching ${config.browserType} browser...`;
        const browserId = await manager.launch(config);
        const pageId = await manager.newPage(browserId);

        const controller = createPageController(manager, browserId, pageId);

        spinner.text = `Navigating to ${url}...`;
        await controller.navigate(url, {
          timeout: parseInt(options.timeout, 10),
        });

        const title = await controller.title();
        spinner.succeed(`Opened: ${chalk.cyan(title)}`);

        console.log('\n' + chalk.gray('Browser session active. Press Ctrl+C to close.'));

        // Keep process alive
        if (options.headed) {
          await new Promise(() => {}); // Wait forever
        } else {
          // In headless mode, close after a moment
          await controller.wait(2000);
          await manager.close(browserId);
        }
      } catch (error) {
        spinner.fail(`Failed to open URL: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // browser screenshot <url>
  browser
    .command('screenshot')
    .description('Take a screenshot of a URL')
    .argument('<url>', 'URL to screenshot')
    .option('-o, --output <path>', 'Output file path', 'screenshot.png')
    .option('-f, --full-page', 'Capture full page')
    .option('-w, --width <pixels>', 'Viewport width', '1280')
    .option('-H, --height <pixels>', 'Viewport height', '720')
    .option('-d, --delay <ms>', 'Delay before screenshot', '0')
    .action(async (url: string, options) => {
      const spinner = ora('Taking screenshot...').start();

      try {
        const manager = getBrowserManager();

        spinner.text = 'Launching browser...';
        const browserId = await manager.launch({
          mode: 'headless',
          viewport: {
            width: parseInt(options.width, 10),
            height: parseInt(options.height, 10),
          },
        });
        const pageId = await manager.newPage(browserId);

        const controller = createPageController(manager, browserId, pageId);

        spinner.text = `Navigating to ${url}...`;
        await controller.navigate(url);

        if (parseInt(options.delay, 10) > 0) {
          spinner.text = `Waiting ${options.delay}ms...`;
          await controller.wait(parseInt(options.delay, 10));
        }

        spinner.text = 'Capturing screenshot...';
        const buffer = await controller.screenshot({
          fullPage: options.fullPage,
          path: options.output,
        });

        await manager.close(browserId);

        const fileSize = (buffer.length / 1024).toFixed(1);
        spinner.succeed(`Screenshot saved to ${chalk.cyan(options.output)} (${fileSize} KB)`);
      } catch (error) {
        spinner.fail(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // browser verify <url>
  browser
    .command('verify')
    .description('Run UI verification checks on a URL')
    .argument('<url>', 'URL to verify')
    .option('-c, --checks <json>', 'JSON file with verification checks')
    .option('--a11y', 'Run accessibility checks')
    .option('--screenshot', 'Take a screenshot for visual comparison')
    .option('-o, --output <path>', 'Output report path')
    .action(async (url: string, options) => {
      const spinner = ora('Running verification...').start();

      try {
        const manager = getBrowserManager();

        spinner.text = 'Launching browser...';
        const browserId = await manager.launch({ mode: 'headless' });
        const pageId = await manager.newPage(browserId);

        const controller = createPageController(manager, browserId, pageId);

        spinner.text = `Navigating to ${url}...`;
        await controller.navigate(url);

        const verifier = createUIVerifier(manager, browserId, pageId);
        const results: Array<{ name: string; passed: boolean; message: string }> = [];

        // Title check
        const title = await controller.title();
        results.push({
          name: 'Page loads',
          passed: title.length > 0,
          message: title.length > 0 ? `Title: "${title}"` : 'No page title',
        });

        // Custom checks from file
        if (options.checks) {
          const checksPath = path.resolve(options.checks);
          if (fs.existsSync(checksPath)) {
            const checksData = JSON.parse(fs.readFileSync(checksPath, 'utf-8'));
            for (const check of checksData.checks || []) {
              const assertion = verifier.expect(check.selector);

              switch (check.type) {
                case 'visible':
                  await assertion.isVisible();
                  break;
                case 'hasText':
                  await assertion.hasText(check.value);
                  break;
                case 'hasClass':
                  await assertion.hasClass(check.value);
                  break;
                default:
                  await assertion.isVisible();
              }

              const checkResults = assertion.getChecks();
              for (const r of checkResults) {
                results.push({
                  name: check.name || check.selector,
                  passed: r.passed,
                  message: r.message,
                });
              }
            }
          }
        }

        // Accessibility checks
        if (options.a11y) {
          spinner.text = 'Running accessibility checks...';
          const a11yResults = await verifier.verifyAccessibility();
          for (const r of a11yResults) {
            results.push({
              name: r.name,
              passed: r.passed,
              message: r.message,
            });
          }
        }

        // Screenshot
        if (options.screenshot) {
          spinner.text = 'Taking verification screenshot...';
          const { buffer } = await verifier.screenshot('verify', { compareBaseline: false });
          const screenshotPath = options.output
            ? options.output.replace(/\.[^.]+$/, '.png')
            : 'verify-screenshot.png';
          fs.writeFileSync(screenshotPath, buffer);
        }

        await manager.close(browserId);

        // Print results
        spinner.stop();

        const passed = results.filter((r) => r.passed).length;
        const failed = results.filter((r) => !r.passed).length;

        console.log('\n' + chalk.bold('Verification Results:'));
        console.log(chalk.gray('─'.repeat(60)));

        for (const result of results) {
          const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
          const name = result.passed ? chalk.white(result.name) : chalk.red(result.name);
          console.log(`  ${icon} ${name}`);
          if (!result.passed) {
            console.log(chalk.gray(`    ${result.message}`));
          }
        }

        console.log(chalk.gray('─'.repeat(60)));

        if (failed === 0) {
          console.log(chalk.green(`\n✓ All ${passed} checks passed`));
        } else {
          console.log(chalk.red(`\n✗ ${failed} of ${passed + failed} checks failed`));
          process.exit(1);
        }

        // Save report if requested
        if (options.output) {
          const report = {
            url,
            timestamp: new Date().toISOString(),
            results,
            summary: { passed, failed, total: results.length },
          };
          fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
          console.log(chalk.gray(`\nReport saved to ${options.output}`));
        }
      } catch (error) {
        spinner.fail(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // browser profiles
  browser
    .command('profiles')
    .description('Manage browser profiles')
    .option('-l, --list', 'List all profiles')
    .option('-c, --create <name>', 'Create a new profile')
    .option('-d, --delete <name>', 'Delete a profile')
    .action(async (options) => {
      const profileDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '.',
        '.clawdralph',
        'browser-profiles'
      );

      if (options.list || (!options.create && !options.delete)) {
        console.log(chalk.bold('\nBrowser Profiles:'));

        if (!fs.existsSync(profileDir)) {
          console.log(chalk.gray('  No profiles found'));
          return;
        }

        const profiles = fs.readdirSync(profileDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        if (profiles.length === 0) {
          console.log(chalk.gray('  No profiles found'));
        } else {
          for (const profile of profiles) {
            console.log(`  ${chalk.cyan('•')} ${profile}`);
          }
        }
      }

      if (options.create) {
        const profilePath = path.join(profileDir, options.create);
        if (fs.existsSync(profilePath)) {
          console.log(chalk.yellow(`Profile "${options.create}" already exists`));
        } else {
          fs.mkdirSync(profilePath, { recursive: true });
          console.log(chalk.green(`Created profile: ${options.create}`));
        }
      }

      if (options.delete) {
        const profilePath = path.join(profileDir, options.delete);
        if (!fs.existsSync(profilePath)) {
          console.log(chalk.yellow(`Profile "${options.delete}" not found`));
        } else {
          fs.rmSync(profilePath, { recursive: true });
          console.log(chalk.green(`Deleted profile: ${options.delete}`));
        }
      }
    });

  // browser devserver
  browser
    .command('devserver')
    .description('Dev server management')
    .option('-d, --detect', 'Detect running dev server')
    .option('-s, --start', 'Start dev server')
    .option('-p, --port <port>', 'Dev server port')
    .option('--cwd <path>', 'Working directory', process.cwd())
    .action(async (options) => {
      if (options.detect) {
        const spinner = ora('Detecting dev server...').start();

        const server = await detectRunningDevServer();

        if (server) {
          spinner.succeed(`Found dev server at ${chalk.cyan(server.url)}`);
          console.log(chalk.gray(`  Type: ${server.type}`));
          console.log(chalk.gray(`  Port: ${server.port}`));
        } else {
          spinner.info('No running dev server detected');
        }
      }

      if (options.start) {
        const spinner = ora('Starting dev server...').start();

        try {
          const config: Partial<DevServerConfig> = {
            cwd: options.cwd,
            port: options.port ? parseInt(options.port, 10) : undefined,
          };

          const manager = createDevServerManager(options.cwd, config);
          const type = await manager.detectServerType();

          spinner.text = `Detected ${type} project, starting dev server...`;
          const info = await manager.start();

          spinner.succeed(`Dev server running at ${chalk.cyan(info.url)}`);

          console.log(chalk.gray('\nPress Ctrl+C to stop the server'));

          // Keep alive
          process.on('SIGINT', async () => {
            console.log(chalk.gray('\nStopping dev server...'));
            await manager.stop();
            process.exit(0);
          });

          await new Promise(() => {}); // Wait forever
        } catch (error) {
          spinner.fail(`Failed to start dev server: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      }

      // Default: show help
      if (!options.detect && !options.start) {
        console.log(chalk.bold('\nDev Server Commands:'));
        console.log(`  ${chalk.cyan('--detect')}  Detect running dev servers`);
        console.log(`  ${chalk.cyan('--start')}   Start the project's dev server`);
      }
    });

  // browser status
  browser
    .command('status')
    .description('Show browser manager status')
    .action(async () => {
      const manager = getBrowserManager();
      const stats = manager.getStats();
      const instances = manager.getInstances();

      console.log(chalk.bold('\nBrowser Manager Status:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`  Total instances:   ${stats.totalInstances}`);
      console.log(`  Running instances: ${stats.runningInstances}`);
      console.log(`  Total pages:       ${stats.totalPages}`);

      if (instances.length > 0) {
        console.log(chalk.bold('\nActive Instances:'));
        for (const instance of instances) {
          const stateColor =
            instance.state === 'running'
              ? chalk.green
              : instance.state === 'error'
              ? chalk.red
              : chalk.yellow;

          console.log(`  ${chalk.cyan('•')} ${instance.id.slice(0, 8)}...`);
          console.log(`    Type: ${instance.type}`);
          console.log(`    Mode: ${instance.mode}`);
          console.log(`    State: ${stateColor(instance.state)}`);
          console.log(`    Pages: ${instance.pageCount}`);
          if (instance.pid) {
            console.log(`    PID: ${instance.pid}`);
          }
        }
      }
    });

  return browser;
}

export default createBrowserCommand;
