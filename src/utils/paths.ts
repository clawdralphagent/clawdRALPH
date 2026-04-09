/**
 * Path utilities for clawdRALPH
 */

import { homedir } from 'os';
import { join, resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Get the user's home directory
 */
export function getHomeDir(): string {
  return homedir();
}

/**
 * Expand ~ to home directory
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return join(getHomeDir(), path.slice(2));
  }
  if (path === '~') {
    return getHomeDir();
  }
  return path;
}

/**
 * Get the clawdRALPH data directory
 */
export function getDataDir(): string {
  const dataDir = process.env['CLAWDRALPH_DATA_DIR'] || join(getHomeDir(), '.clawdralph');
  return resolve(dataDir);
}

/**
 * Get the default config file path
 */
export function getConfigPath(): string {
  return process.env['CLAWDRALPH_CONFIG'] || join(getDataDir(), 'config.json');
}

/**
 * Get the sessions directory
 */
export function getSessionsDir(): string {
  return join(getDataDir(), 'sessions');
}

/**
 * Get the logs directory
 */
export function getLogsDir(): string {
  return join(getDataDir(), 'logs');
}

/**
 * Get the credentials directory
 */
export function getCredentialsDir(): string {
  return join(getDataDir(), 'credentials');
}

/**
 * Get the memory/vector DB directory
 */
export function getMemoryDir(): string {
  return join(getDataDir(), 'memory');
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure parent directory exists
 */
export function ensureParentDir(filePath: string): void {
  ensureDir(dirname(filePath));
}

/**
 * Get the package root directory
 */
export function getPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Navigate up from src/utils to root
  return resolve(__dirname, '..', '..');
}

/**
 * Resolve a path relative to the package root
 */
export function fromPackageRoot(...paths: string[]): string {
  return join(getPackageRoot(), ...paths);
}

/**
 * Check if a path is within allowed directories
 */
export function isPathAllowed(targetPath: string, allowedDirs: string[]): boolean {
  const resolvedTarget = resolve(expandTilde(targetPath));
  return allowedDirs.some((dir) => {
    const resolvedDir = resolve(expandTilde(dir));
    return resolvedTarget.startsWith(resolvedDir);
  });
}
