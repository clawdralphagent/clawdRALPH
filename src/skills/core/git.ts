/**
 * Git Skill
 * Provides Git repository operations
 */

import { execSync } from 'child_process';
import * as path from 'path';
import { createLogger } from '../../logging/logger.js';
import {
  BaseSkill,
  createSkillManifest,
  type SkillConfig,
  type SkillContext,
  type SkillResult,
} from '../types.js';

const log = createLogger('skill-git');

/**
 * Git Skill Implementation
 */
export class GitSkill extends BaseSkill {
  constructor(config?: SkillConfig) {
    super(
      createSkillManifest({
        id: 'git',
        name: 'Git',
        description: 'Git version control operations',
        category: 'git',
        permissions: ['read', 'write', 'execute'],
        tags: ['core', 'version-control', 'git'],
      }),
      config
    );

    this.registerTools();
  }

  private registerTools(): void {
    // Git status
    this.registerTool(
      {
        name: 'git_status',
        description: 'Get the status of the Git repository',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path (default: current directory)',
            },
            short: {
              type: 'boolean',
              description: 'Show short status',
            },
          },
        },
      },
      this.gitStatus.bind(this)
    );

    // Git diff
    this.registerTool(
      {
        name: 'git_diff',
        description: 'Show changes between commits, commit and working tree, etc.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            staged: {
              type: 'boolean',
              description: 'Show staged changes',
            },
            file: {
              type: 'string',
              description: 'Specific file to diff',
            },
          },
        },
      },
      this.gitDiff.bind(this)
    );

    // Git log
    this.registerTool(
      {
        name: 'git_log',
        description: 'Show commit history',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of commits to show',
            },
            oneline: {
              type: 'boolean',
              description: 'Show one commit per line',
            },
            file: {
              type: 'string',
              description: 'Show history for specific file',
            },
          },
        },
      },
      this.gitLog.bind(this)
    );

    // Git add
    this.registerTool(
      {
        name: 'git_add',
        description: 'Stage files for commit',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            files: {
              type: 'array',
              description: 'Files to stage (use "." for all)',
              items: { type: 'string' },
            },
          },
          required: ['files'],
        },
      },
      this.gitAdd.bind(this)
    );

    // Git commit
    this.registerTool(
      {
        name: 'git_commit',
        description: 'Commit staged changes',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            message: {
              type: 'string',
              description: 'Commit message',
            },
          },
          required: ['message'],
        },
      },
      this.gitCommit.bind(this)
    );

    // Git branch
    this.registerTool(
      {
        name: 'git_branch',
        description: 'List, create, or delete branches',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            name: {
              type: 'string',
              description: 'Branch name (for create/delete)',
            },
            create: {
              type: 'boolean',
              description: 'Create a new branch',
            },
            delete: {
              type: 'boolean',
              description: 'Delete a branch',
            },
            list: {
              type: 'boolean',
              description: 'List all branches',
            },
          },
        },
      },
      this.gitBranch.bind(this)
    );

    // Git checkout
    this.registerTool(
      {
        name: 'git_checkout',
        description: 'Switch branches or restore working tree files',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            target: {
              type: 'string',
              description: 'Branch name or commit to checkout',
            },
            createBranch: {
              type: 'boolean',
              description: 'Create and checkout a new branch',
            },
            file: {
              type: 'string',
              description: 'Restore a specific file',
            },
          },
          required: ['target'],
        },
      },
      this.gitCheckout.bind(this)
    );

    // Git pull
    this.registerTool(
      {
        name: 'git_pull',
        description: 'Fetch and integrate with remote repository',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            remote: {
              type: 'string',
              description: 'Remote name (default: origin)',
            },
            branch: {
              type: 'string',
              description: 'Branch to pull',
            },
            rebase: {
              type: 'boolean',
              description: 'Rebase instead of merge',
            },
          },
        },
      },
      this.gitPull.bind(this)
    );

    // Git push
    this.registerTool(
      {
        name: 'git_push',
        description: 'Push commits to remote repository',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            remote: {
              type: 'string',
              description: 'Remote name (default: origin)',
            },
            branch: {
              type: 'string',
              description: 'Branch to push',
            },
            setUpstream: {
              type: 'boolean',
              description: 'Set upstream tracking',
            },
          },
        },
      },
      this.gitPush.bind(this)
    );

    // Git stash
    this.registerTool(
      {
        name: 'git_stash',
        description: 'Stash changes in working directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            action: {
              type: 'string',
              description: 'Action: push, pop, list, show, drop',
              enum: ['push', 'pop', 'list', 'show', 'drop'],
            },
            message: {
              type: 'string',
              description: 'Stash message (for push)',
            },
          },
        },
      },
      this.gitStash.bind(this)
    );

    // Git reset
    this.registerTool(
      {
        name: 'git_reset',
        description: 'Reset current HEAD to specified state',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            target: {
              type: 'string',
              description: 'Commit or reference to reset to',
            },
            mode: {
              type: 'string',
              description: 'Reset mode: soft, mixed, hard',
              enum: ['soft', 'mixed', 'hard'],
            },
            file: {
              type: 'string',
              description: 'Unstage a specific file',
            },
          },
        },
      },
      this.gitReset.bind(this)
    );

    // Git show
    this.registerTool(
      {
        name: 'git_show',
        description: 'Show various types of objects',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path',
            },
            object: {
              type: 'string',
              description: 'Object to show (commit, tag, etc.)',
            },
          },
          required: ['object'],
        },
      },
      this.gitShow.bind(this)
    );
  }

  private executeGit(args: string[], cwd: string, timeout: number = 30000): string {
    const command = `git ${args.join(' ')}`;
    log.debug('Executing git command', { command, cwd });

    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
  }

  private getRepoPath(args: Record<string, unknown>, context: SkillContext): string {
    const repoPath = args.path as string | undefined;
    return repoPath ? path.resolve(context.workingDir, repoPath) : context.workingDir;
  }

  private async gitStatus(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const short = args.short as boolean ?? false;

    try {
      const gitArgs = ['status'];
      if (short) gitArgs.push('-s');

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || 'Working tree clean',
        data: { cwd },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git status failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitDiff(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const staged = args.staged as boolean ?? false;
    const file = args.file as string | undefined;

    try {
      const gitArgs = ['diff'];
      if (staged) gitArgs.push('--staged');
      if (file) gitArgs.push('--', file);

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || 'No differences',
        data: { cwd, staged },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git diff failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitLog(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const limit = args.limit as number ?? 10;
    const oneline = args.oneline as boolean ?? true;
    const file = args.file as string | undefined;

    try {
      const gitArgs = ['log', `-${limit}`];
      if (oneline) gitArgs.push('--oneline');
      if (file) gitArgs.push('--', file);

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || 'No commits',
        data: { cwd, limit },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git log failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitAdd(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const files = args.files as string[];

    try {
      const gitArgs = ['add', ...files];
      this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: `Staged: ${files.join(', ')}`,
        data: { cwd, files },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git add failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitCommit(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const message = args.message as string;

    try {
      const gitArgs = ['commit', '-m', message];
      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim(),
        data: { cwd, message },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git commit failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitBranch(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const name = args.name as string | undefined;
    const create = args.create as boolean ?? false;
    const del = args.delete as boolean ?? false;
    const list = args.list as boolean ?? true;

    try {
      const gitArgs = ['branch'];

      if (name) {
        if (del) {
          gitArgs.push('-d', name);
        } else if (create) {
          gitArgs.push(name);
        }
      } else if (list) {
        gitArgs.push('-a');
      }

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || 'No branches',
        data: { cwd },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git branch failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitCheckout(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const target = args.target as string;
    const createBranch = args.createBranch as boolean ?? false;
    const file = args.file as string | undefined;

    try {
      const gitArgs = ['checkout'];

      if (createBranch) {
        gitArgs.push('-b', target);
      } else if (file) {
        gitArgs.push(target, '--', file);
      } else {
        gitArgs.push(target);
      }

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || `Switched to ${target}`,
        data: { cwd, target },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git checkout failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitPull(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const remote = args.remote as string ?? 'origin';
    const branch = args.branch as string | undefined;
    const rebase = args.rebase as boolean ?? false;

    try {
      const gitArgs = ['pull'];
      if (rebase) gitArgs.push('--rebase');
      gitArgs.push(remote);
      if (branch) gitArgs.push(branch);

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim(),
        data: { cwd, remote, branch },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git pull failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitPush(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const remote = args.remote as string ?? 'origin';
    const branch = args.branch as string | undefined;
    const setUpstream = args.setUpstream as boolean ?? false;

    try {
      const gitArgs = ['push'];
      if (setUpstream) gitArgs.push('-u');
      gitArgs.push(remote);
      if (branch) gitArgs.push(branch);

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || 'Push successful',
        data: { cwd, remote, branch },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git push failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitStash(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const action = args.action as string ?? 'push';
    const message = args.message as string | undefined;

    try {
      const gitArgs = ['stash', action];
      if (action === 'push' && message) {
        gitArgs.push('-m', message);
      }

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || 'Stash operation complete',
        data: { cwd, action },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git stash failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitReset(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const target = args.target as string | undefined;
    const mode = args.mode as string ?? 'mixed';
    const file = args.file as string | undefined;

    try {
      const gitArgs = ['reset'];

      if (file) {
        gitArgs.push('HEAD', '--', file);
      } else {
        gitArgs.push(`--${mode}`);
        if (target) gitArgs.push(target);
      }

      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim() || 'Reset complete',
        data: { cwd, mode, target },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git reset failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async gitShow(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const cwd = this.getRepoPath(args, context);
    const object = args.object as string;

    try {
      const gitArgs = ['show', object];
      const output = this.executeGit(gitArgs, cwd, context.timeout);

      return {
        success: true,
        output: output.trim(),
        data: { cwd, object },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Git show failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }
}

/**
 * Git skill factory
 */
export function createGitSkill(config?: SkillConfig): GitSkill {
  return new GitSkill(config);
}
