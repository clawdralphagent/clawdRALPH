/**
 * Memory commands - manage the memory/vector database system
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createLogger } from '../../logging/logger.js';
import { createMemorySystem } from '../../memory/index.js';
import { getDataDir } from '../../utils/paths.js';
import * as path from 'path';
import * as fs from 'fs';

const log = createLogger('memory-cli');

/**
 * Create the memory command group
 */
export function memoryCommand(): Command {
  const cmd = new Command('memory');

  cmd
    .description('Manage the memory and vector database system');

  // Status subcommand
  cmd
    .command('status')
    .description('Show memory system status')
    .option('--json', 'Output as JSON')
    .action(async (options: { json: boolean }) => {
      const spinner = ora('Getting memory status...').start();

      try {
        const memory = createMemorySystem();
        await memory.initialize();
        const stats = await memory.getStats();
        await memory.close();

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log('');
          console.log(chalk.cyan.bold('Memory System Status'));
          console.log('');
          console.log(chalk.gray('Documents:     ') + chalk.white(stats.documentCount));
          console.log(chalk.gray('Embeddings:    ') + chalk.white(stats.embeddingCount));
          console.log(chalk.gray('Database size: ') + chalk.white(`${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB`));
          console.log(chalk.gray('Provider:      ') + chalk.white(stats.embeddingProvider));
          console.log(chalk.gray('Dimensions:    ') + chalk.white(stats.embeddingDimensions));
          console.log('');
        }
      } catch (error) {
        spinner.fail('Failed to get memory status');
        log.error('Memory status failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Search subcommand
  cmd
    .command('search <query>')
    .description('Search through stored memories')
    .option('-l, --limit <number>', 'Maximum results', '10')
    .option('-m, --mode <mode>', 'Search mode (vector, fulltext, hybrid)', 'hybrid')
    .option('-t, --type <type>', 'Document type filter')
    .option('--json', 'Output as JSON')
    .action(async (query: string, options: { limit: string; mode: string; type?: string; json: boolean }) => {
      const spinner = ora('Searching...').start();

      try {
        const memory = createMemorySystem();
        await memory.initialize();

        const results = await memory.search_documents(query, {
          limit: parseInt(options.limit, 10),
          mode: options.mode as 'vector' | 'fulltext' | 'hybrid',
          types: options.type ? [options.type as 'conversation' | 'code' | 'markdown' | 'text'] : undefined,
        });

        await memory.close();
        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log('');
          console.log(chalk.cyan(`Found ${results.totalResults} results (${results.took}ms)`));
          console.log('');

          for (const result of results.results) {
            console.log(chalk.white.bold(`[${result.document.type}] Score: ${result.score.toFixed(3)}`));
            console.log(chalk.gray(result.document.id));

            // Truncate content
            const content = result.document.content.slice(0, 200).replace(/\n/g, ' ');
            console.log(content + (result.document.content.length > 200 ? '...' : ''));

            if (result.highlights && result.highlights.length > 0) {
              console.log(chalk.yellow('Highlights:'));
              for (const hl of result.highlights.slice(0, 2)) {
                console.log(chalk.gray('  ' + hl.slice(0, 100)));
              }
            }
            console.log('');
          }
        }
      } catch (error) {
        spinner.fail('Search failed');
        log.error('Memory search failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Index subcommand
  cmd
    .command('index <path>')
    .description('Index files or directories into memory')
    .option('-r, --recursive', 'Index directories recursively', true)
    .option('-e, --extensions <ext...>', 'File extensions to index')
    .option('--exclude <patterns...>', 'Patterns to exclude')
    .action(async (targetPath: string, options: { recursive: boolean; extensions?: string[]; exclude?: string[] }) => {
      const spinner = ora('Indexing...').start();

      try {
        const memory = createMemorySystem();
        await memory.initialize();

        const fullPath = path.resolve(targetPath);
        const stats = fs.statSync(fullPath);

        if (stats.isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const ext = path.extname(fullPath).toLowerCase();

          if (ext === '.md') {
            const ids = await memory.indexMarkdown(fullPath, content);
            spinner.succeed(`Indexed markdown: ${ids.length} chunks`);
          } else {
            const ids = await memory.indexCodeFile(fullPath, content);
            spinner.succeed(`Indexed code: ${ids.length} chunks`);
          }
        } else if (stats.isDirectory()) {
          spinner.text = 'Scanning directory...';

          const { BatchIndexer, DefaultMemoryIndexer } = await import('../../memory/indexer.js');
          const indexer = new DefaultMemoryIndexer(memory.getStore(), memory.getEmbeddingProvider());
          const batchIndexer = new BatchIndexer(indexer);

          const result = await batchIndexer.indexDirectory(fullPath, {
            extensions: options.extensions ?? ['.ts', '.js', '.py', '.md', '.txt'],
            exclude: options.exclude ?? ['node_modules', '.git', 'dist', 'build'],
            recursive: options.recursive,
          });

          spinner.succeed(`Indexed ${result.indexed} files (${result.errors} errors)`);

          if (result.errors > 0) {
            console.log(chalk.yellow(`  ${result.errors} files failed to index`));
          }
        }

        await memory.close();
      } catch (error) {
        spinner.fail('Indexing failed');
        log.error('Memory index failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Clear subcommand
  cmd
    .command('clear')
    .description('Clear all stored memories')
    .option('-f, --force', 'Skip confirmation')
    .action(async (options: { force: boolean }) => {
      if (!options.force) {
        console.log(chalk.yellow('Warning: This will delete all stored memories.'));
        console.log('Use --force to confirm.');
        return;
      }

      const spinner = ora('Clearing memory...').start();

      try {
        const memory = createMemorySystem();
        await memory.initialize();
        await memory.clear();
        await memory.close();

        spinner.succeed('Memory cleared');
      } catch (error) {
        spinner.fail('Failed to clear memory');
        log.error('Memory clear failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Store subcommand
  cmd
    .command('store <content>')
    .description('Store text content in memory')
    .option('-t, --type <type>', 'Content type', 'text')
    .option('--tags <tags...>', 'Tags to add')
    .action(async (content: string, options: { type: string; tags?: string[] }) => {
      const spinner = ora('Storing...').start();

      try {
        const memory = createMemorySystem();
        await memory.initialize();

        const id = await memory.indexText(content, { tags: options.tags ?? [] });
        await memory.close();

        spinner.succeed(`Stored with ID: ${id}`);
      } catch (error) {
        spinner.fail('Failed to store');
        log.error('Memory store failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Export subcommand
  cmd
    .command('export <output>')
    .description('Export memory database')
    .option('--format <format>', 'Export format (json)', 'json')
    .action(async (output: string, options: { format: string }) => {
      const spinner = ora('Exporting...').start();

      try {
        const dbPath = path.join(getDataDir(), 'memory.db');

        if (!fs.existsSync(dbPath)) {
          spinner.fail('No memory database found');
          return;
        }

        if (options.format === 'json') {
          // For JSON export, we need to read and serialize
          const memory = createMemorySystem();
          await memory.initialize();
          const stats = await memory.getStats();
          await memory.close();

          const exportData = {
            exportedAt: new Date().toISOString(),
            stats,
            // Note: Full document export would require additional implementation
          };

          fs.writeFileSync(output, JSON.stringify(exportData, null, 2));
        } else {
          // Copy database file directly
          fs.copyFileSync(dbPath, output);
        }

        spinner.succeed(`Exported to ${output}`);
      } catch (error) {
        spinner.fail('Export failed');
        log.error('Memory export failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  return cmd;
}
