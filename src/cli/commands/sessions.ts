/**
 * Sessions command - manage gateway sessions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initSessionManager } from '../../gateway/session.js';

/**
 * Create the sessions command
 */
export function sessionsCommand(): Command {
  const cmd = new Command('sessions');

  cmd.description('Manage gateway sessions');

  // sessions list
  cmd
    .command('list')
    .description('List all sessions')
    .option('-a, --active', 'Show only active sessions')
    .option('--json', 'Output as JSON')
    .action((options: { active?: boolean; json?: boolean }) => {
      // Initialize session manager to load from disk
      const sessionManager = initSessionManager();
      sessionManager.loadAll();

      let sessions = sessionManager.getAll();

      if (options.active) {
        sessions = sessions.filter((s) => s.state === 'active');
      }

      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      if (sessions.length === 0) {
        console.log(chalk.gray('No sessions found'));
        return;
      }

      console.log(chalk.cyan(`Sessions (${sessions.length}):`));
      console.log('');

      for (const session of sessions) {
        const stateColor = session.state === 'active' ? chalk.green :
                          session.state === 'completed' ? chalk.blue :
                          chalk.red;

        console.log(chalk.white(`  ${session.id}`));
        console.log(chalk.gray(`    Client:   ${session.clientId}`));
        console.log(chalk.gray(`    State:    `) + stateColor(session.state));
        console.log(chalk.gray(`    Created:  ${session.createdAt.toISOString()}`));
        console.log(chalk.gray(`    Messages: ${session.conversation.length}`));
        if (session.loopState) {
          console.log(chalk.gray(`    Loop:     ${session.loopState.status} (${session.loopState.iteration}/${session.loopState.maxIterations})`));
        }
        console.log('');
      }
    });

  // sessions show
  cmd
    .command('show <sessionId>')
    .description('Show details of a specific session')
    .option('--json', 'Output as JSON')
    .option('--conversation', 'Include conversation history')
    .action((sessionId: string, options: { json?: boolean; conversation?: boolean }) => {
      const sessionManager = initSessionManager();
      sessionManager.loadAll();

      const session = sessionManager.get(sessionId);

      if (!session) {
        console.error(chalk.red(`Session not found: ${sessionId}`));
        process.exit(1);
      }

      if (options.json) {
        const output = options.conversation ? session : { ...session, conversation: `[${session.conversation.length} entries]` };
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(chalk.cyan('Session Details:'));
      console.log('');
      console.log(chalk.gray('  ID:        ') + chalk.white(session.id));
      console.log(chalk.gray('  Client:    ') + chalk.white(session.clientId));
      console.log(chalk.gray('  State:     ') + chalk.white(session.state));
      console.log(chalk.gray('  Created:   ') + chalk.white(session.createdAt.toISOString()));
      console.log(chalk.gray('  Updated:   ') + chalk.white(session.updatedAt.toISOString()));
      console.log(chalk.gray('  Messages:  ') + chalk.white(session.conversation.length.toString()));

      if (Object.keys(session.metadata).length > 0) {
        console.log('');
        console.log(chalk.gray('  Metadata:'));
        for (const [key, value] of Object.entries(session.metadata)) {
          console.log(chalk.gray(`    ${key}: `) + chalk.white(JSON.stringify(value)));
        }
      }

      if (session.loopState) {
        console.log('');
        console.log(chalk.gray('  Loop State:'));
        console.log(chalk.gray('    Status:     ') + chalk.white(session.loopState.status));
        console.log(chalk.gray('    PRD:        ') + chalk.white(session.loopState.prdFile));
        console.log(chalk.gray('    Iteration:  ') + chalk.white(`${session.loopState.iteration}/${session.loopState.maxIterations}`));
        console.log(chalk.gray('    Completed:  ') + chalk.white(session.loopState.completedStories.length.toString()));
        if (session.loopState.currentStory) {
          console.log(chalk.gray('    Current:    ') + chalk.white(session.loopState.currentStory));
        }
      }

      if (options.conversation && session.conversation.length > 0) {
        console.log('');
        console.log(chalk.cyan('Conversation:'));
        console.log('');

        for (const entry of session.conversation) {
          const roleColor = entry.role === 'user' ? chalk.blue :
                           entry.role === 'assistant' ? chalk.green :
                           chalk.gray;
          const timestamp = new Date(entry.timestamp).toLocaleTimeString();

          console.log(roleColor(`  [${timestamp}] ${entry.role}:`));
          console.log(chalk.white(`    ${entry.content.slice(0, 200)}${entry.content.length > 200 ? '...' : ''}`));
          console.log('');
        }
      }
    });

  // sessions delete
  cmd
    .command('delete <sessionId>')
    .description('Delete a session')
    .option('-f, --force', 'Delete without confirmation')
    .action(async (sessionId: string, options: { force?: boolean }) => {
      const sessionManager = initSessionManager();
      sessionManager.loadAll();

      const session = sessionManager.get(sessionId);

      if (!session) {
        console.error(chalk.red(`Session not found: ${sessionId}`));
        process.exit(1);
      }

      if (!options.force && session.state === 'active') {
        console.error(chalk.yellow('Warning: Session is still active. Use --force to delete.'));
        process.exit(1);
      }

      const deleted = await sessionManager.delete(sessionId);

      if (deleted) {
        console.log(chalk.green(`Session deleted: ${sessionId}`));
      } else {
        console.error(chalk.red('Failed to delete session'));
        process.exit(1);
      }
    });

  // sessions clean
  cmd
    .command('clean')
    .description('Clean up old completed/failed sessions')
    .option('--days <number>', 'Delete sessions older than N days', '7')
    .action((options: { days: string }) => {
      const days = parseInt(options.days, 10);
      const maxAgeMs = days * 24 * 60 * 60 * 1000;

      const sessionManager = initSessionManager();
      sessionManager.loadAll();

      const cleaned = sessionManager.cleanup(maxAgeMs);

      console.log(chalk.green(`Cleaned ${cleaned} sessions older than ${days} days`));
    });

  // sessions export
  cmd
    .command('export <sessionId>')
    .description('Export a session to JSON file')
    .option('-o, --output <path>', 'Output file path')
    .action((sessionId: string, options: { output?: string }) => {
      const sessionManager = initSessionManager();
      sessionManager.loadAll();

      const session = sessionManager.get(sessionId);

      if (!session) {
        console.error(chalk.red(`Session not found: ${sessionId}`));
        process.exit(1);
      }

      const output = options.output ?? `session-${sessionId}.json`;
      const fs = require('fs');
      fs.writeFileSync(output, JSON.stringify(session, null, 2));

      console.log(chalk.green(`Session exported to: ${output}`));
    });

  return cmd;
}
