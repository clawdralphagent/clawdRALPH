/**
 * Filesystem Skill
 * Provides file and directory operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../logging/logger.js';
import {
  BaseSkill,
  createSkillManifest,
  type SkillConfig,
  type SkillContext,
  type SkillResult,
} from '../types.js';

const log = createLogger('skill-filesystem');

/**
 * Filesystem Skill Implementation
 */
export class FilesystemSkill extends BaseSkill {
  constructor(config?: SkillConfig) {
    super(
      createSkillManifest({
        id: 'filesystem',
        name: 'Filesystem',
        description: 'Read, write, and manage files and directories',
        category: 'filesystem',
        permissions: ['read', 'write'],
        tags: ['core', 'files', 'directories'],
      }),
      config
    );

    this.registerTools();
  }

  private registerTools(): void {
    // Read file
    this.registerTool(
      {
        name: 'fs_read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to read',
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf-8)',
            },
          },
          required: ['path'],
        },
      },
      this.readFile.bind(this)
    );

    // Write file
    this.registerTool(
      {
        name: 'fs_write_file',
        description: 'Write content to a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to write',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
            append: {
              type: 'boolean',
              description: 'Append to file instead of overwriting',
            },
          },
          required: ['path', 'content'],
        },
      },
      this.writeFile.bind(this)
    );

    // List directory
    this.registerTool(
      {
        name: 'fs_list_dir',
        description: 'List contents of a directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the directory',
            },
            recursive: {
              type: 'boolean',
              description: 'List recursively',
            },
            pattern: {
              type: 'string',
              description: 'Filter by glob pattern',
            },
          },
          required: ['path'],
        },
      },
      this.listDirectory.bind(this)
    );

    // Create directory
    this.registerTool(
      {
        name: 'fs_mkdir',
        description: 'Create a directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the directory to create',
            },
            recursive: {
              type: 'boolean',
              description: 'Create parent directories if needed',
            },
          },
          required: ['path'],
        },
      },
      this.makeDirectory.bind(this)
    );

    // Delete file/directory
    this.registerTool(
      {
        name: 'fs_delete',
        description: 'Delete a file or directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to delete',
            },
            recursive: {
              type: 'boolean',
              description: 'Delete directories recursively',
            },
          },
          required: ['path'],
        },
      },
      this.deletePath.bind(this)
    );

    // Copy file/directory
    this.registerTool(
      {
        name: 'fs_copy',
        description: 'Copy a file or directory',
        parameters: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source path',
            },
            destination: {
              type: 'string',
              description: 'Destination path',
            },
            recursive: {
              type: 'boolean',
              description: 'Copy directories recursively',
            },
          },
          required: ['source', 'destination'],
        },
      },
      this.copyPath.bind(this)
    );

    // Move/rename file
    this.registerTool(
      {
        name: 'fs_move',
        description: 'Move or rename a file or directory',
        parameters: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source path',
            },
            destination: {
              type: 'string',
              description: 'Destination path',
            },
          },
          required: ['source', 'destination'],
        },
      },
      this.movePath.bind(this)
    );

    // Check if exists
    this.registerTool(
      {
        name: 'fs_exists',
        description: 'Check if a file or directory exists',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to check',
            },
          },
          required: ['path'],
        },
      },
      this.checkExists.bind(this)
    );

    // Get file info
    this.registerTool(
      {
        name: 'fs_stat',
        description: 'Get file or directory information',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to get info for',
            },
          },
          required: ['path'],
        },
      },
      this.getFileInfo.bind(this)
    );

    // Search files
    this.registerTool(
      {
        name: 'fs_search',
        description: 'Search for files matching a pattern',
        parameters: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Directory to search in',
            },
            pattern: {
              type: 'string',
              description: 'Search pattern (supports * and ** globs)',
            },
            content: {
              type: 'string',
              description: 'Search for files containing this text',
            },
          },
          required: ['directory', 'pattern'],
        },
      },
      this.searchFiles.bind(this)
    );
  }

  private resolvePath(filePath: string, context: SkillContext): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(context.workingDir, filePath);
  }

  private async readFile(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const filePath = this.resolvePath(args.path as string, context);
    const encoding = (args.encoding as BufferEncoding) ?? 'utf-8';

    try {
      const content = fs.readFileSync(filePath, { encoding });
      log.debug('File read', { path: filePath, size: content.length });

      return {
        success: true,
        output: content,
        data: { path: filePath, size: content.length },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async writeFile(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const filePath = this.resolvePath(args.path as string, context);
    const content = args.content as string;
    const append = args.append as boolean ?? false;

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (append) {
        fs.appendFileSync(filePath, content, 'utf-8');
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
      }

      log.debug('File written', { path: filePath, append, size: content.length });

      return {
        success: true,
        output: `File ${append ? 'appended' : 'written'}: ${filePath}`,
        data: { path: filePath, size: content.length },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async listDirectory(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const dirPath = this.resolvePath(args.path as string, context);
    const recursive = args.recursive as boolean ?? false;

    try {
      const files = this.collectFiles(dirPath, recursive);

      const output = files
        .map((f) => {
          const relative = path.relative(dirPath, f.path);
          return `${f.isDirectory ? 'd' : '-'} ${relative}`;
        })
        .join('\n');

      return {
        success: true,
        output: output || '(empty directory)',
        data: { files, count: files.length },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private collectFiles(
    dirPath: string,
    recursive: boolean
  ): Array<{ path: string; isDirectory: boolean }> {
    const files: Array<{ path: string; isDirectory: boolean }> = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      files.push({ path: fullPath, isDirectory: entry.isDirectory() });

      if (entry.isDirectory() && recursive) {
        files.push(...this.collectFiles(fullPath, true));
      }
    }

    return files;
  }

  private async makeDirectory(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const dirPath = this.resolvePath(args.path as string, context);
    const recursive = args.recursive as boolean ?? true;

    try {
      fs.mkdirSync(dirPath, { recursive });
      log.debug('Directory created', { path: dirPath });

      return {
        success: true,
        output: `Directory created: ${dirPath}`,
        data: { path: dirPath },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async deletePath(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const targetPath = this.resolvePath(args.path as string, context);
    const recursive = args.recursive as boolean ?? false;

    try {
      const stats = fs.statSync(targetPath);

      if (stats.isDirectory()) {
        fs.rmSync(targetPath, { recursive });
      } else {
        fs.unlinkSync(targetPath);
      }

      log.debug('Path deleted', { path: targetPath });

      return {
        success: true,
        output: `Deleted: ${targetPath}`,
        data: { path: targetPath },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to delete: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async copyPath(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const source = this.resolvePath(args.source as string, context);
    const destination = this.resolvePath(args.destination as string, context);
    const recursive = args.recursive as boolean ?? false;

    try {
      const stats = fs.statSync(source);

      if (stats.isDirectory()) {
        fs.cpSync(source, destination, { recursive });
      } else {
        fs.copyFileSync(source, destination);
      }

      log.debug('Path copied', { source, destination });

      return {
        success: true,
        output: `Copied: ${source} -> ${destination}`,
        data: { source, destination },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to copy: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async movePath(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const source = this.resolvePath(args.source as string, context);
    const destination = this.resolvePath(args.destination as string, context);

    try {
      fs.renameSync(source, destination);
      log.debug('Path moved', { source, destination });

      return {
        success: true,
        output: `Moved: ${source} -> ${destination}`,
        data: { source, destination },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to move: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async checkExists(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const targetPath = this.resolvePath(args.path as string, context);
    const exists = fs.existsSync(targetPath);

    return {
      success: true,
      output: exists ? `Exists: ${targetPath}` : `Does not exist: ${targetPath}`,
      data: { path: targetPath, exists },
      duration: 0,
    };
  }

  private async getFileInfo(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const targetPath = this.resolvePath(args.path as string, context);

    try {
      const stats = fs.statSync(targetPath);

      const info = {
        path: targetPath,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        mode: stats.mode.toString(8),
      };

      const output = [
        `Path: ${info.path}`,
        `Type: ${info.isDirectory ? 'directory' : 'file'}`,
        `Size: ${info.size} bytes`,
        `Created: ${info.created}`,
        `Modified: ${info.modified}`,
      ].join('\n');

      return {
        success: true,
        output,
        data: info,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async searchFiles(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const directory = this.resolvePath(args.directory as string, context);
    const pattern = args.pattern as string;
    const contentSearch = args.content as string | undefined;

    try {
      const matches: string[] = [];
      const regex = this.globToRegex(pattern);

      this.searchRecursive(directory, regex, contentSearch, matches);

      const output = matches.length > 0
        ? matches.join('\n')
        : 'No files found matching the pattern';

      return {
        success: true,
        output,
        data: { matches, count: matches.length },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private searchRecursive(
    dir: string,
    pattern: RegExp,
    contentSearch: string | undefined,
    matches: string[]
  ): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.searchRecursive(fullPath, pattern, contentSearch, matches);
      } else if (pattern.test(entry.name)) {
        if (contentSearch) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes(contentSearch)) {
              matches.push(fullPath);
            }
          } catch {
            // Skip files that can't be read
          }
        } else {
          matches.push(fullPath);
        }
      }
    }
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    return new RegExp(`^${escaped}$`);
  }
}

/**
 * Filesystem skill factory
 */
export function createFilesystemSkill(config?: SkillConfig): FilesystemSkill {
  return new FilesystemSkill(config);
}
