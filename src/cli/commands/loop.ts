/**
 * Loop command - manage Ralph autonomous development loops
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getConfig } from '../../config/loader.js';
import { createLogger } from '../../logging/logger.js';
import {
  createLoopEngine,
  loadPRD,
  getStoryProgress,
} from '../../ralph/index.js';

const log = createLogger('loop');

// Store active loop engine
let activeLoop: ReturnType<typeof createLoopEngine> | null = null;

/**
 * Create the loop command
 */
export function loopCommand(): Command {
  const cmd = new Command('loop');

  cmd.description('Manage autonomous development loops');

  // loop start
  cmd
    .command('start')
    .description('Start an autonomous development loop')
    .option('-p, --prd <path>', 'Path to PRD file', 'prd.json')
    .option('-m, --max-iterations <number>', 'Maximum iterations')
    .option('--no-tests', 'Skip test quality gate')
    .option('--no-typecheck', 'Skip typecheck quality gate')
    .option('--no-commit', 'Disable auto-commit')
    .option('--push', 'Push commits to remote')
    .option('--pause-on-failure', 'Pause loop when a story fails')
    .action(
      async (options: {
        prd: string;
        maxIterations?: string;
        tests: boolean;
        typecheck: boolean;
        commit: boolean;
        push: boolean;
        pauseOnFailure: boolean;
      }) => {
        const config = getConfig();
        const maxIterations = options.maxIterations
          ? parseInt(options.maxIterations, 10)
          : config.ralph.maxIterations;

        const prdPath = resolve(options.prd);

        // Check PRD exists
        if (!existsSync(prdPath)) {
          console.error(chalk.red(`PRD file not found: ${prdPath}`));
          console.log(chalk.gray('Use `clawdralph prd create` to create a new PRD'));
          process.exit(1);
        }

        const spinner = ora('Initializing development loop...').start();

        try {
          // Build quality gates based on options
          const qualityGates = [];
          if (options.typecheck) {
            qualityGates.push({
              type: 'typecheck' as const,
              name: 'TypeScript Check',
              command: 'npm run typecheck',
              enabled: true,
              required: true,
              timeout: 120000,
              retries: 0,
            });
          }
          if (options.tests) {
            qualityGates.push({
              type: 'tests' as const,
              name: 'Unit Tests',
              command: 'npm test',
              enabled: true,
              required: true,
              timeout: 300000,
              retries: 1,
            });
          }

          // Create loop engine
          activeLoop = createLoopEngine({
            maxIterations,
            qualityGates,
            autoCommit: options.commit,
            autoPush: options.push,
            pauseOnFailure: options.pauseOnFailure,
          });

          // Set up event listeners
          activeLoop.on('started', (data) => {
            console.log(chalk.cyan(`\nLoop started: ${data.loopId}`));
            console.log(chalk.gray(`PRD: ${data.prdId} (${data.totalStories} stories)`));
          });

          activeLoop.on('iteration:started', (data) => {
            console.log(chalk.cyan(`\n--- Iteration ${data.iteration} ---`));
            console.log(chalk.white(`Story: ${data.storyTitle}`));
            console.log(chalk.gray(`ID: ${data.storyId}`));
          });

          activeLoop.on('iteration:completed', (data) => {
            const statusColor = data.status === 'success' ? chalk.green : chalk.red;
            console.log(statusColor(`Status: ${data.status.toUpperCase()}`));
          });

          activeLoop.on('quality:started', () => {
            process.stdout.write(chalk.gray('Running quality gates...'));
          });

          activeLoop.on('quality:completed', (data) => {
            const icon = data.passed ? chalk.green(' ✓') : chalk.red(' ✗');
            console.log(icon);
          });

          activeLoop.on('paused', (data) => {
            console.log(chalk.yellow(`\nLoop paused at iteration ${data.iteration}`));
            if (data.reason) console.log(chalk.gray(`Reason: ${data.reason}`));
            console.log(chalk.gray('Use `clawdralph loop resume` to continue'));
          });

          activeLoop.on('completed', (data) => {
            console.log(chalk.cyan('\n=== Loop Complete ==='));
            console.log(chalk.gray(`Status: ${data.status}`));
            console.log(chalk.green(`Stories completed: ${data.storiesCompleted}`));
            console.log(chalk.red(`Stories failed: ${data.storiesFailed}`));
          });

          activeLoop.on('error', (data) => {
            console.error(chalk.red(`\nLoop error: ${data.error}`));
          });

          // Initialize
          const initResult = await activeLoop.initialize(prdPath);
          if (!initResult.success) {
            spinner.fail(chalk.red(`Failed to initialize: ${initResult.error.message}`));
            process.exit(1);
          }

          spinner.succeed('Loop initialized');

          // Show configuration
          console.log('');
          console.log(chalk.cyan('Loop Configuration:'));
          console.log(chalk.gray('  PRD file:       ') + chalk.white(prdPath));
          console.log(chalk.gray('  Max iterations: ') + chalk.white(maxIterations.toString()));
          console.log(chalk.gray('  Tests:          ') + chalk.white(options.tests ? 'yes' : 'no'));
          console.log(
            chalk.gray('  Typecheck:      ') + chalk.white(options.typecheck ? 'yes' : 'no')
          );
          console.log(chalk.gray('  Auto-commit:    ') + chalk.white(options.commit ? 'yes' : 'no'));
          console.log(chalk.gray('  Auto-push:      ') + chalk.white(options.push ? 'yes' : 'no'));

          // Start the loop
          console.log('');
          console.log(chalk.cyan('Starting autonomous development loop...'));
          console.log(chalk.gray('Press Ctrl+C to stop\n'));

          // Handle Ctrl+C
          process.on('SIGINT', () => {
            console.log(chalk.yellow('\n\nStopping loop...'));
            activeLoop?.stop('User interrupted');
          });

          await activeLoop.start();

          log.info('Loop completed', {
            prd: options.prd,
            maxIterations,
          });
        } catch (error) {
          spinner.fail(chalk.red('Failed to start loop'));
          log.error('Loop start failed', error);
          process.exit(1);
        }
      }
    );

  // loop status
  cmd
    .command('status')
    .description('Show status of active development loop')
    .option('-p, --prd <path>', 'Path to PRD file to check', 'prd.json')
    .action(async (options: { prd: string }) => {
      // Check active loop first
      if (activeLoop) {
        const summary = await activeLoop.getProgressSummary();
        if (summary) {
          console.log(chalk.cyan('\n=== Active Loop Status ===\n'));
          console.log(chalk.gray('Status:            ') + formatStatus(summary.loopStatus));
          console.log(chalk.gray('Current iteration: ') + chalk.white(summary.currentIteration.toString()));
          console.log(chalk.gray('Max iterations:    ') + chalk.white(summary.maxIterations.toString()));
          console.log(chalk.gray('Stories completed: ') + chalk.green(summary.storiesCompleted.toString()));
          console.log(chalk.gray('Stories failed:    ') + chalk.red(summary.storiesFailed.toString()));
          console.log(chalk.gray('Stories remaining: ') + chalk.yellow(summary.storiesRemaining.toString()));
          console.log('');
          return;
        }
      }

      // Check PRD file
      const prdPath = resolve(options.prd);
      if (!existsSync(prdPath)) {
        console.log(chalk.yellow('No active loop'));
        console.log(chalk.gray('\nUse `clawdralph loop start` to start a new loop'));
        return;
      }

      const prdResult = await loadPRD(prdPath);
      if (!prdResult.success) {
        console.error(chalk.red(`Failed to load PRD: ${prdResult.error.message}`));
        return;
      }

      const prd = prdResult.data;
      const progress = getStoryProgress(prd.stories);

      console.log(chalk.cyan('\n=== PRD Status ===\n'));
      console.log(chalk.gray('PRD:               ') + chalk.white(prd.title));
      console.log(chalk.gray('Total stories:     ') + chalk.white(progress.total.toString()));
      console.log(chalk.gray('Pending:           ') + chalk.yellow(progress.pending.toString()));
      console.log(chalk.gray('In progress:       ') + chalk.blue(progress.inProgress.toString()));
      console.log(chalk.gray('Completed:         ') + chalk.green(progress.completed.toString()));
      console.log(chalk.gray('Failed:            ') + chalk.red(progress.failed.toString()));
      console.log(chalk.gray('Blocked:           ') + chalk.magenta(progress.blocked.toString()));
      console.log(chalk.gray('Ready to start:    ') + chalk.cyan(progress.startable.toString()));
      console.log(chalk.gray('Completion:        ') + chalk.white(`${progress.percentComplete}%`));
      console.log('');
    });

  // loop stop
  cmd
    .command('stop')
    .description('Stop the active development loop')
    .option('-f, --force', 'Force stop without waiting for current iteration')
    .action((options: { force: boolean }) => {
      if (!activeLoop || !activeLoop.isLoopRunning()) {
        console.log(chalk.gray('No active loop to stop'));
        return;
      }

      if (options.force) {
        console.log(chalk.yellow('Force stopping loop...'));
      } else {
        console.log(chalk.yellow('Stopping loop after current iteration...'));
      }

      activeLoop.stop(options.force ? 'Forced stop' : 'User requested stop');
    });

  // loop pause
  cmd
    .command('pause')
    .description('Pause the active development loop')
    .action(() => {
      if (!activeLoop || !activeLoop.isLoopRunning()) {
        console.log(chalk.gray('No active loop to pause'));
        return;
      }

      if (activeLoop.isLoopPaused()) {
        console.log(chalk.gray('Loop is already paused'));
        return;
      }

      activeLoop.pause('User requested pause');
      console.log(chalk.yellow('Loop paused'));
      console.log(chalk.gray('Use `clawdralph loop resume` to continue'));
    });

  // loop resume
  cmd
    .command('resume')
    .description('Resume a paused development loop')
    .action(() => {
      if (!activeLoop) {
        console.log(chalk.gray('No paused loop to resume'));
        return;
      }

      if (!activeLoop.isLoopPaused()) {
        console.log(chalk.gray('Loop is not paused'));
        return;
      }

      activeLoop.resume();
      console.log(chalk.green('Loop resumed'));
    });

  // loop history
  cmd
    .command('history')
    .description('Show history of iterations from progress file')
    .option('-n, --limit <number>', 'Number of entries to show', '10')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { limit: string; dir: string }) => {
      const { ProgressTracker } = await import('../../ralph/progress.js');
      const workspace = resolve(options.dir);

      const tracker = new ProgressTracker(workspace);
      const progressResult = await tracker.readProgress();

      if (!progressResult.success || !progressResult.data) {
        console.log(chalk.gray('No progress history found'));
        return;
      }

      const summary = await tracker.getProgressSummary();

      console.log(chalk.cyan('\n=== Loop History ===\n'));
      console.log(chalk.gray('Total iterations:  ') + chalk.white(summary.totalIterations.toString()));
      console.log(chalk.gray('Total learnings:   ') + chalk.white(summary.totalLearnings.toString()));
      console.log(chalk.gray('Total patterns:    ') + chalk.white(summary.totalPatterns.toString()));

      if (summary.lastIteration) {
        console.log('');
        console.log(chalk.gray('Last iteration:'));
        console.log(chalk.gray('  Number:    ') + chalk.white(summary.lastIteration.number.toString()));
        console.log(chalk.gray('  Story:     ') + chalk.white(summary.lastIteration.storyId));
        console.log(chalk.gray('  Status:    ') + formatStatus(summary.lastIteration.status));
        console.log(chalk.gray('  Timestamp: ') + chalk.white(summary.lastIteration.timestamp));
      }

      console.log('');
    });

  return cmd;
}

/**
 * Format status with color
 */
function formatStatus(status: string): string {
  switch (status.toLowerCase()) {
    case 'running':
    case 'in_progress':
      return chalk.blue(status);
    case 'completed':
    case 'success':
      return chalk.green(status);
    case 'failed':
    case 'failure':
      return chalk.red(status);
    case 'paused':
      return chalk.yellow(status);
    case 'idle':
    case 'pending':
      return chalk.gray(status);
    case 'stopped':
      return chalk.magenta(status);
    default:
      return chalk.white(status);
  }
}
