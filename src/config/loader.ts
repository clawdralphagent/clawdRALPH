/**
 * Configuration loading and validation
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import JSON5 from 'json5';
import { AppConfigSchema, type AppConfig, type ConfigMetadata } from '../types/config.js';
import type { Result } from '../types/common.js';
import { ok, err } from '../utils/result.js';
import { getConfigPath, ensureParentDir, expandTilde } from '../utils/paths.js';
import { getDefaultConfig, getExampleConfig } from './defaults.js';
import { createLogger } from '../logging/logger.js';

const log = createLogger('config');

/**
 * Configuration loader state
 */
interface ConfigState {
  config: AppConfig;
  metadata: ConfigMetadata;
}

let currentState: ConfigState | null = null;

/**
 * Parse environment variable references in config values
 * Supports ${VAR_NAME} syntax
 */
function resolveEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
      const envValue = process.env[envVar];
      if (envValue === undefined) {
        log.warn(`Environment variable ${envVar} is not set`);
        return '';
      }
      return envValue;
    });
  }

  if (Array.isArray(value)) {
    return value.map(resolveEnvVars);
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveEnvVars(val);
    }
    return result;
  }

  return value;
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Load configuration from file
 */
export function loadConfig(configPath?: string): Result<AppConfig, Error> {
  const path = configPath ?? getConfigPath();
  const resolvedPath = expandTilde(path);

  try {
    // Start with defaults
    let config = getDefaultConfig();
    let isDefault = true;

    // Load from file if it exists
    if (existsSync(resolvedPath)) {
      const fileContent = readFileSync(resolvedPath, 'utf-8');
      const parsed = JSON5.parse(fileContent) as Partial<AppConfig>;
      const resolved = resolveEnvVars(parsed) as Partial<AppConfig>;

      // Merge with defaults
      config = deepMerge(config, resolved);
      isDefault = false;

      log.debug('Loaded configuration from file', { path: resolvedPath });
    } else {
      log.debug('Using default configuration', { path: resolvedPath });
    }

    // Validate with Zod
    const validationResult = AppConfigSchema.safeParse(config);

    if (!validationResult.success) {
      const errors = validationResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return err(new Error(`Configuration validation failed: ${errors}`));
    }

    // Store state
    currentState = {
      config: validationResult.data,
      metadata: {
        path: resolvedPath,
        lastLoaded: new Date(),
        isDefault,
      },
    };

    return ok(validationResult.data);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error(`Failed to load configuration: ${String(error)}`)
    );
  }
}

/**
 * Get the current configuration
 */
export function getConfig(): AppConfig {
  if (!currentState) {
    const result = loadConfig();
    if (!result.success) {
      throw result.error;
    }
  }
  return currentState!.config;
}

/**
 * Get configuration metadata
 */
export function getConfigMetadata(): ConfigMetadata | null {
  return currentState?.metadata ?? null;
}

/**
 * Reload configuration from file
 */
export function reloadConfig(): Result<AppConfig, Error> {
  const path = currentState?.metadata.path ?? getConfigPath();
  return loadConfig(path);
}

/**
 * Save configuration to file
 */
export function saveConfig(config: AppConfig, configPath?: string): Result<void, Error> {
  const path = configPath ?? currentState?.metadata.path ?? getConfigPath();
  const resolvedPath = expandTilde(path);

  try {
    ensureParentDir(resolvedPath);

    // Serialize with JSON5 for readability
    const content = JSON5.stringify(config, null, 2);
    writeFileSync(resolvedPath, content, 'utf-8');

    // Update state
    if (currentState) {
      currentState.config = config;
      currentState.metadata.path = resolvedPath;
      currentState.metadata.isDefault = false;
    }

    log.info('Configuration saved', { path: resolvedPath });
    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error(`Failed to save configuration: ${String(error)}`)
    );
  }
}

/**
 * Initialize configuration file with defaults
 */
export function initConfig(configPath?: string): Result<void, Error> {
  const path = configPath ?? getConfigPath();
  const resolvedPath = expandTilde(path);

  if (existsSync(resolvedPath)) {
    return err(new Error(`Configuration file already exists: ${resolvedPath}`));
  }

  try {
    ensureParentDir(resolvedPath);

    // Use example config (not full defaults) for cleaner initial file
    const content = JSON5.stringify(getExampleConfig(), null, 2);
    writeFileSync(resolvedPath, content, 'utf-8');

    log.info('Configuration file created', { path: resolvedPath });
    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Failed to initialize configuration: ${String(error)}`)
    );
  }
}

/**
 * Validate a configuration object
 */
export function validateConfig(config: unknown): Result<AppConfig, Error> {
  const result = AppConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    return err(new Error(`Configuration validation failed: ${errors}`));
  }

  return ok(result.data);
}
