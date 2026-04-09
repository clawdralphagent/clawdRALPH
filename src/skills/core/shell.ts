/**
 * Shell Skill
 * Provides shell command execution
 */

import { spawn, execSync } from 'child_process';
import * as path from 'path';
import { createLogger } from '../../logging/logger.js';
import {
  BaseSkill,
  createSkillManifest,
  type SkillConfig,
  type SkillContext,
  type SkillResult,
} from '../types.js';

const log = createLogger('skill-shell');

/**
 * Shell Skill Implementation
 */
export class ShellSkill extends BaseSkill {
  private allowedCommands: Set<string>;
  private deniedCommands: Set<string>;

  constructor(config?: SkillConfig) {
    super(
      createSkillManifest({
        id: 'shell',
        name: 'Shell',
        description: 'Execute shell commands and scripts',
        category: 'shell',
        permissions: ['execute', 'read', 'write'],
        tags: ['core', 'shell', 'commands'],
      }),
      config
    );

    // Default allowed commands
    this.allowedCommands = new Set([
      'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'sort', 'uniq',
      'awk', 'sed', 'cut', 'tr', 'echo', 'pwd', 'date', 'which', 'type',
      'npm', 'npx', 'node', 'pnpm', 'yarn', 'bun',
      'python', 'python3', 'pip', 'pip3',
      'cargo', 'rustc', 'go', 'java', 'javac',
      'make', 'cmake',
      'curl', 'wget',
      'jq', 'yq',
      'tar', 'gzip', 'gunzip', 'zip', 'unzip',
      'docker', 'docker-compose',
      'kubectl', 'helm',
    ]);

    // Commands that should never be run
    this.deniedCommands = new Set([
      'rm', 'rmdir', 'dd', 'mkfs', 'fdisk', 'parted',
      'shutdown', 'reboot', 'halt', 'poweroff',
      'passwd', 'useradd', 'userdel', 'usermod',
      'chmod', 'chown', 'chgrp',
      'mount', 'umount',
      'kill', 'killall', 'pkill',
      'iptables', 'ufw', 'firewall-cmd',
      'su', 'sudo',
    ]);

    this.registerTools();
  }

  private registerTools(): void {
    // Execute command
    this.registerTool(
      {
        name: 'shell_exec',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command to execute',
            },
            cwd: {
              type: 'string',
              description: 'Working directory',
            },
            env: {
              type: 'object',
              description: 'Environment variables',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
            },
          },
          required: ['command'],
        },
      },
      this.execCommand.bind(this)
    );

    // Execute script
    this.registerTool(
      {
        name: 'shell_script',
        description: 'Execute a shell script',
        parameters: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description: 'The script content to execute',
            },
            shell: {
              type: 'string',
              description: 'Shell to use (default: /bin/sh)',
            },
            cwd: {
              type: 'string',
              description: 'Working directory',
            },
            env: {
              type: 'object',
              description: 'Environment variables',
            },
          },
          required: ['script'],
        },
      },
      this.execScript.bind(this)
    );

    // Execute with streaming output
    this.registerTool(
      {
        name: 'shell_stream',
        description: 'Execute a command with streaming output',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command to execute',
            },
            cwd: {
              type: 'string',
              description: 'Working directory',
            },
          },
          required: ['command'],
        },
      },
      this.execStream.bind(this)
    );

    // Get environment variable
    this.registerTool(
      {
        name: 'shell_env',
        description: 'Get environment variables',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Variable name (omit for all)',
            },
          },
        },
      },
      this.getEnv.bind(this)
    );

    // Check if command exists
    this.registerTool(
      {
        name: 'shell_which',
        description: 'Check if a command exists and get its path',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to check',
            },
          },
          required: ['command'],
        },
      },
      this.whichCommand.bind(this)
    );
  }

  private isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    // Extract base command
    const parts = command.trim().split(/\s+/);
    const baseCommand = parts[0] ?? '';

    // Check denied list first
    if (this.deniedCommands.has(baseCommand)) {
      return {
        allowed: false,
        reason: `Command "${baseCommand}" is not allowed for security reasons`,
      };
    }

    // Check for dangerous patterns
    if (command.includes('rm -rf /') || command.includes('rm -rf ~')) {
      return {
        allowed: false,
        reason: 'Dangerous command pattern detected',
      };
    }

    // Check if using sudo
    if (baseCommand === 'sudo') {
      return {
        allowed: false,
        reason: 'Sudo commands are not allowed',
      };
    }

    // Check allowed list (if configured to be strict)
    if (this.config.custom?.strictMode && baseCommand && !this.allowedCommands.has(baseCommand)) {
      return {
        allowed: false,
        reason: `Command "${baseCommand}" is not in the allowed list`,
      };
    }

    return { allowed: true };
  }

  private async execCommand(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const command = args.command as string;
    const cwd = args.cwd as string ?? context.workingDir;
    const env = args.env as Record<string, string> ?? {};
    const timeout = args.timeout as number ?? context.timeout;

    // Security check
    const check = this.isCommandAllowed(command);
    if (!check.allowed) {
      return {
        success: false,
        output: check.reason!,
        error: check.reason,
        duration: 0,
      };
    }

    try {
      log.debug('Executing command', { command, cwd });

      const output = execSync(command, {
        cwd: path.resolve(cwd),
        encoding: 'utf-8',
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env, ...env },
        shell: '/bin/sh',
      });

      return {
        success: true,
        output: output.trim(),
        data: { command, cwd },
        duration: 0,
      };
    } catch (error: unknown) {
      const execError = error as { status?: number; stderr?: string; message?: string };
      const stderr = execError.stderr ?? '';
      const exitCode = execError.status ?? 1;

      return {
        success: false,
        output: stderr || execError.message || 'Command failed',
        error: `Exit code: ${exitCode}`,
        data: { exitCode },
        duration: 0,
      };
    }
  }

  private async execScript(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const script = args.script as string;
    const shell = args.shell as string ?? '/bin/sh';
    const cwd = args.cwd as string ?? context.workingDir;
    const env = args.env as Record<string, string> ?? {};

    // Basic security check on script content
    const lines = script.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const check = this.isCommandAllowed(trimmed);
        if (!check.allowed) {
          return {
            success: false,
            output: `Script contains disallowed command: ${check.reason}`,
            error: check.reason,
            duration: 0,
          };
        }
      }
    }

    try {
      log.debug('Executing script', { shell, cwd, lines: lines.length });

      const output = execSync(script, {
        cwd: path.resolve(cwd),
        encoding: 'utf-8',
        timeout: context.timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...env },
        shell,
      });

      return {
        success: true,
        output: output.trim(),
        data: { shell, cwd },
        duration: 0,
      };
    } catch (error: unknown) {
      const execError = error as { status?: number; stderr?: string; message?: string };

      return {
        success: false,
        output: execError.stderr ?? execError.message ?? 'Script execution failed',
        error: `Exit code: ${execError.status ?? 1}`,
        duration: 0,
      };
    }
  }

  private async execStream(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const command = args.command as string;
    const cwd = args.cwd as string ?? context.workingDir;

    // Security check
    const check = this.isCommandAllowed(command);
    if (!check.allowed) {
      return {
        success: false,
        output: check.reason!,
        error: check.reason,
        duration: 0,
      };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      const chunks: string[] = [];

      const child = spawn(command, {
        cwd: path.resolve(cwd),
        shell: '/bin/sh',
        env: process.env,
      });

      child.stdout.on('data', (data) => {
        chunks.push(data.toString());
      });

      child.stderr.on('data', (data) => {
        chunks.push(data.toString());
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        const output = chunks.join('');

        resolve({
          success: code === 0,
          output: output.trim(),
          data: { exitCode: code },
          error: code !== 0 ? `Exit code: ${code}` : undefined,
          duration,
        });
      });

      child.on('error', (error) => {
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          output: error.message,
          error: error.message,
          duration,
        });
      });

      // Handle timeout
      if (context.timeout) {
        setTimeout(() => {
          child.kill('SIGTERM');
        }, context.timeout);
      }

      // Handle abort signal
      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          child.kill('SIGTERM');
        });
      }
    });
  }

  private async getEnv(
    args: Record<string, unknown>,
    _context: SkillContext
  ): Promise<SkillResult> {
    const name = args.name as string | undefined;

    if (name) {
      const value = process.env[name];
      return {
        success: true,
        output: value ?? `Environment variable "${name}" is not set`,
        data: { [name]: value ?? null },
        duration: 0,
      };
    }

    // Return all env vars (filtered for security)
    const safeEnvVars = [
      'HOME', 'USER', 'PATH', 'PWD', 'SHELL', 'TERM', 'LANG',
      'NODE_ENV', 'NODE_VERSION', 'NPM_VERSION',
      'HOSTNAME', 'EDITOR', 'VISUAL',
    ];

    const filtered: Record<string, string> = {};
    for (const key of safeEnvVars) {
      if (process.env[key]) {
        filtered[key] = process.env[key]!;
      }
    }

    const output = Object.entries(filtered)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    return {
      success: true,
      output,
      data: filtered,
      duration: 0,
    };
  }

  private async whichCommand(
    args: Record<string, unknown>,
    _context: SkillContext
  ): Promise<SkillResult> {
    const command = args.command as string;

    try {
      const output = execSync(`which ${command}`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      return {
        success: true,
        output: output.trim(),
        data: { command, path: output.trim(), exists: true },
        duration: 0,
      };
    } catch {
      return {
        success: true,
        output: `Command "${command}" not found`,
        data: { command, exists: false },
        duration: 0,
      };
    }
  }
}

/**
 * Shell skill factory
 */
export function createShellSkill(config?: SkillConfig): ShellSkill {
  return new ShellSkill(config);
}
