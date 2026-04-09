/**
 * PRD command - create and manage Product Requirements Documents
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from '../../logging/logger.js';
import {
  loadPRD,
  savePRD,
  convertMarkdownToPRD,
  generateMarkdown,
  validatePRD,
  getPRDStats,
  findPRDFiles,
  createPRD,
  createStory,
  type UserStory,
} from '../../ralph/index.js';

const log = createLogger('prd');

/**
 * Create the prd command
 */
export function prdCommand(): Command {
  const cmd = new Command('prd');

  cmd.description('Create and manage Product Requirements Documents');

  // prd create
  cmd
    .command('create')
    .description('Create a new PRD interactively')
    .option('-n, --name <name>', 'Feature name')
    .option('-o, --output <path>', 'Output path for PRD', 'prd.json')
    .option('-w, --workspace <path>', 'Workspace directory', '.')
    .action(async (options: { name?: string; output: string; workspace: string }) => {
      console.log(chalk.cyan('\n=== PRD Creation Wizard ===\n'));

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const question = (prompt: string): Promise<string> => {
        return new Promise((resolve) => {
          rl.question(chalk.gray(prompt), (answer) => {
            resolve(answer.trim());
          });
        });
      };

      try {
        // Get feature name
        let title = options.name ?? '';
        if (!title) {
          title = await question('Feature name: ');
          if (!title) {
            console.log(chalk.red('Feature name is required'));
            rl.close();
            return;
          }
        }

        // Generate ID from name
        const id = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 50);

        // Get description
        console.log(chalk.gray('\nDescribe the feature (press Enter twice to finish):'));
        let description = '';
        let emptyLineCount = 0;
        while (emptyLineCount < 1) {
          const line = await question('');
          if (!line) {
            emptyLineCount++;
          } else {
            emptyLineCount = 0;
            description += (description ? '\n' : '') + line;
          }
        }

        // Get goals
        console.log(chalk.gray('\nList goals (one per line, empty line to finish):'));
        const goals: string[] = [];
        while (true) {
          const goal = await question('Goal: ');
          if (!goal) break;
          goals.push(goal);
        }

        // Ask about stories
        console.log(chalk.gray('\nWould you like to add user stories now? (y/n):'));
        const addStories = (await question('')).toLowerCase() === 'y';

        const stories: UserStory[] = [];
        if (addStories) {
          let storyCount = 0;
          while (true) {
            console.log(chalk.gray(`\n--- Story ${storyCount + 1} ---`));
            const storyTitle = await question('Title (empty to finish): ');
            if (!storyTitle) break;

            storyCount++;
            const storyDesc = await question('Description: ');

            console.log(chalk.gray('Acceptance criteria (one per line, empty to finish):'));
            const criteria: string[] = [];
            while (true) {
              const criterion = await question('- ');
              if (!criterion) break;
              criteria.push(criterion);
            }

            const priorityStr = await question('Priority (1-10, default 5): ');
            const priority = priorityStr ? Math.min(10, Math.max(1, parseInt(priorityStr, 10))) : 5;

            const sizeStr = await question('Size (small/medium/large/xlarge, default medium): ');
            const size = ['small', 'medium', 'large', 'xlarge'].includes(sizeStr) ? sizeStr : 'medium';

            stories.push(createStory({
              id: `story-${storyCount}`,
              title: storyTitle,
              description: storyDesc,
              acceptanceCriteria: criteria,
              priority: isNaN(priority) ? 5 : priority,
              size: size as 'small' | 'medium' | 'large' | 'xlarge',
            }));
          }
        }

        rl.close();

        // Create PRD
        const workspace = resolve(options.workspace);
        const prd = createPRD({
          id,
          title,
          description,
          workspace,
          goals,
          stories,
        });

        // Save PRD
        const outputPath = resolve(options.output);
        const spinner = ora('Saving PRD...').start();

        const saveResult = await savePRD(prd, outputPath);
        if (!saveResult.success) {
          spinner.fail(chalk.red(`Failed to save PRD: ${saveResult.error.message}`));
          return;
        }

        spinner.succeed(chalk.green('PRD created successfully'));

        console.log('');
        console.log(chalk.gray('PRD ID:     ') + chalk.white(prd.id));
        console.log(chalk.gray('Title:      ') + chalk.white(prd.title));
        console.log(chalk.gray('Stories:    ') + chalk.white(prd.stories.length.toString()));
        console.log(chalk.gray('Output:     ') + chalk.white(outputPath));
        console.log('');
        console.log(chalk.gray('Use `clawdralph loop start -p ' + options.output + '` to start development'));
        console.log('');

        log.info('PRD created', { id: prd.id, output: outputPath, stories: prd.stories.length });
      } catch (error) {
        rl.close();
        console.error(chalk.red('Failed to create PRD'));
        log.error('PRD create failed', error);
        process.exit(1);
      }
    });

  // prd convert
  cmd
    .command('convert <input>')
    .description('Convert a markdown PRD to JSON format')
    .option('-o, --output <path>', 'Output path for JSON')
    .option('-w, --workspace <path>', 'Workspace directory', '.')
    .action(async (input: string, options: { output?: string; workspace: string }) => {
      const inputPath = resolve(input);

      if (!existsSync(inputPath)) {
        console.error(chalk.red(`Input file not found: ${inputPath}`));
        process.exit(1);
      }

      const workspace = resolve(options.workspace);
      const outputPath = options.output
        ? resolve(options.output)
        : inputPath.replace(/\.md$/, '.json');

      const spinner = ora('Converting PRD...').start();

      try {
        const result = await convertMarkdownToPRD(inputPath, workspace, outputPath);

        if (!result.success) {
          spinner.fail(chalk.red(`Failed to convert: ${result.error.message}`));
          process.exit(1);
        }

        const prd = result.data;
        spinner.succeed(chalk.green('PRD converted successfully'));

        console.log('');
        console.log(chalk.gray('PRD ID:     ') + chalk.white(prd.id));
        console.log(chalk.gray('Title:      ') + chalk.white(prd.title));
        console.log(chalk.gray('Stories:    ') + chalk.white(prd.stories.length.toString()));
        console.log(chalk.gray('Output:     ') + chalk.white(outputPath));
        console.log('');

        // Validate and show warnings
        const validation = validatePRD(prd);
        if (validation.warnings.length > 0) {
          console.log(chalk.yellow('Warnings:'));
          for (const warning of validation.warnings) {
            console.log(chalk.yellow(`  - ${warning}`));
          }
          console.log('');
        }

        log.info('PRD converted', { input: inputPath, output: outputPath });
      } catch (error) {
        spinner.fail(chalk.red('Failed to convert PRD'));
        log.error('PRD convert failed', error);
        process.exit(1);
      }
    });

  // prd show
  cmd
    .command('show [path]')
    .description('Display a PRD file')
    .option('--json', 'Output as raw JSON')
    .option('--markdown', 'Output as markdown')
    .option('--stories', 'Show only stories')
    .action(async (path: string | undefined, options: { json: boolean; markdown: boolean; stories: boolean }) => {
      const prdPath = resolve(path ?? 'prd.json');

      if (!existsSync(prdPath)) {
        console.error(chalk.red(`PRD file not found: ${prdPath}`));
        console.log(chalk.gray('Use `clawdralph prd create` to create a new PRD'));
        process.exit(1);
      }

      const result = await loadPRD(prdPath);
      if (!result.success) {
        console.error(chalk.red(`Failed to load PRD: ${result.error.message}`));
        process.exit(1);
      }

      const prd = result.data;

      if (options.json) {
        console.log(JSON.stringify(prd, null, 2));
        return;
      }

      if (options.markdown) {
        console.log(generateMarkdown(prd));
        return;
      }

      if (options.stories) {
        console.log(chalk.cyan(`\n=== Stories: ${prd.title} ===\n`));
        for (const story of prd.stories) {
          const statusColor = getStatusColor(story.status);
          console.log(`${statusColor('●')} ${chalk.bold(story.title)}`);
          console.log(chalk.gray(`  ID: ${story.id} | Priority: ${story.priority} | Size: ${story.size} | Status: ${story.status}`));
          if (story.description) {
            console.log(chalk.gray(`  ${story.description.slice(0, 80)}${story.description.length > 80 ? '...' : ''}`));
          }
          console.log('');
        }
        return;
      }

      // Default: show summary
      const stats = getPRDStats(prd);

      console.log(chalk.cyan(`\n=== ${prd.title} ===\n`));

      if (prd.description) {
        console.log(chalk.white(prd.description));
        console.log('');
      }

      if (prd.goals.length > 0) {
        console.log(chalk.gray('Goals:'));
        for (const goal of prd.goals) {
          console.log(chalk.gray(`  - ${goal}`));
        }
        console.log('');
      }

      console.log(chalk.gray('Statistics:'));
      console.log(chalk.gray('  Total stories:  ') + chalk.white(stats.totalStories.toString()));
      console.log(chalk.gray('  Pending:        ') + chalk.yellow(stats.pending.toString()));
      console.log(chalk.gray('  In progress:    ') + chalk.blue(stats.inProgress.toString()));
      console.log(chalk.gray('  Completed:      ') + chalk.green(stats.completed.toString()));
      console.log(chalk.gray('  Failed:         ') + chalk.red(stats.failed.toString()));
      console.log(chalk.gray('  Blocked:        ') + chalk.magenta(stats.blocked.toString()));
      console.log(chalk.gray('  Completion:     ') + chalk.white(`${stats.completionPercentage}%`));
      console.log('');

      console.log(chalk.gray(`Use --stories to see all stories`));
      console.log(chalk.gray(`Use --markdown to export as markdown`));
      console.log('');
    });

  // prd validate
  cmd
    .command('validate [path]')
    .description('Validate a PRD file')
    .action(async (path: string | undefined) => {
      const prdPath = resolve(path ?? 'prd.json');

      if (!existsSync(prdPath)) {
        console.error(chalk.red(`PRD file not found: ${prdPath}`));
        process.exit(1);
      }

      const spinner = ora('Validating PRD...').start();

      const result = await loadPRD(prdPath);
      if (!result.success) {
        spinner.fail(chalk.red(`Failed to load PRD: ${result.error.message}`));
        process.exit(1);
      }

      const prd = result.data;
      const validation = validatePRD(prd);

      if (validation.valid) {
        spinner.succeed(chalk.green('PRD is valid'));
      } else {
        spinner.fail(chalk.red('PRD has validation errors'));
      }

      console.log('');

      if (validation.errors.length > 0) {
        console.log(chalk.red('Errors:'));
        for (const error of validation.errors) {
          console.log(chalk.red(`  ✗ ${error}`));
        }
        console.log('');
      }

      if (validation.warnings.length > 0) {
        console.log(chalk.yellow('Warnings:'));
        for (const warning of validation.warnings) {
          console.log(chalk.yellow(`  ⚠ ${warning}`));
        }
        console.log('');
      }

      if (validation.valid && validation.warnings.length === 0) {
        console.log(chalk.green('No issues found'));
        console.log('');
      }
    });

  // prd list
  cmd
    .command('list')
    .description('List all PRD files in the project')
    .option('-d, --dir <path>', 'Directory to search', '.')
    .action(async (options: { dir: string }) => {
      const searchDir = resolve(options.dir);
      const spinner = ora(`Searching for PRDs in ${searchDir}...`).start();

      const files = await findPRDFiles(searchDir);

      if (files.length === 0) {
        spinner.info('No PRD files found');
        console.log(chalk.gray('\nUse `clawdralph prd create` to create a new PRD'));
        return;
      }

      spinner.succeed(`Found ${files.length} PRD file(s)`);
      console.log('');

      for (const file of files) {
        const result = await loadPRD(file);
        if (result.success) {
          const prd = result.data;
          const stats = getPRDStats(prd);
          const completionBar = createProgressBar(stats.completionPercentage);

          console.log(chalk.cyan(`● ${prd.title}`));
          console.log(chalk.gray(`  File: ${file}`));
          console.log(chalk.gray(`  Stories: ${stats.totalStories} | ${completionBar} ${stats.completionPercentage}%`));
          console.log('');
        } else {
          console.log(chalk.red(`● Error loading: ${file}`));
          console.log(chalk.gray(`  ${result.error.message}`));
          console.log('');
        }
      }
    });

  // prd export
  cmd
    .command('export [path]')
    .description('Export PRD to markdown')
    .option('-o, --output <path>', 'Output file path')
    .action(async (path: string | undefined, options: { output?: string }) => {
      const prdPath = resolve(path ?? 'prd.json');

      if (!existsSync(prdPath)) {
        console.error(chalk.red(`PRD file not found: ${prdPath}`));
        process.exit(1);
      }

      const result = await loadPRD(prdPath);
      if (!result.success) {
        console.error(chalk.red(`Failed to load PRD: ${result.error.message}`));
        process.exit(1);
      }

      const prd = result.data;
      const markdown = generateMarkdown(prd);

      if (options.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(options.output, markdown, 'utf-8');
        console.log(chalk.green(`Exported to: ${options.output}`));
      } else {
        console.log(markdown);
      }
    });

  return cmd;
}

/**
 * Get color function for story status
 */
function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'completed': return chalk.green;
    case 'in_progress': return chalk.blue;
    case 'failed': return chalk.red;
    case 'blocked': return chalk.magenta;
    case 'skipped': return chalk.gray;
    default: return chalk.yellow;
  }
}

/**
 * Create a simple progress bar
 */
function createProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}
