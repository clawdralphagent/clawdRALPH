/**
 * Environment variable utilities
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDataDir } from './paths.js';

/**
 * Load environment variables from .env files
 */
export function loadEnv(): void {
  // Load from clawdralph data directory
  const dataEnvPath = join(getDataDir(), '.env');
  if (existsSync(dataEnvPath)) {
    dotenvConfig({ path: dataEnvPath });
  }

  // Load from current working directory (lower priority)
  const cwdEnvPath = join(process.cwd(), '.env');
  if (existsSync(cwdEnvPath)) {
    dotenvConfig({ path: cwdEnvPath });
  }
}

/**
 * Get an environment variable with optional default
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * Get a required environment variable
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get an environment variable as a boolean
 */
export function getEnvBool(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get an environment variable as a number
 */
export function getEnvNumber(key: string, defaultValue?: number): number | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return getEnv('NODE_ENV') === 'development';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return getEnv('NODE_ENV') === 'production';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return getEnv('NODE_ENV') === 'test' || getEnv('VITEST') === 'true';
}

/**
 * Get the current environment name
 */
export function getEnvironment(): string {
  return getEnv('NODE_ENV', 'development') ?? 'development';
}
