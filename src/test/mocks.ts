/**
 * Mock factories for testing
 */

import type { AppConfig } from '../types/config.js';
import type { LogEntry, LogLevel } from '../types/common.js';
import { getDefaultConfig } from '../config/defaults.js';

/**
 * Create a mock configuration with optional overrides
 */
export function createMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const defaults = getDefaultConfig();

  return {
    ...defaults,
    ...overrides,
    gateway: { ...defaults.gateway, ...overrides.gateway },
    models: { ...defaults.models, ...overrides.models },
    channels: {
      ...defaults.channels,
      ...overrides.channels,
      telegram: { ...defaults.channels.telegram, ...overrides.channels?.telegram },
      slack: { ...defaults.channels.slack, ...overrides.channels?.slack },
      discord: { ...defaults.channels.discord, ...overrides.channels?.discord },
      whatsapp: { ...defaults.channels.whatsapp, ...overrides.channels?.whatsapp },
    },
    ralph: {
      ...defaults.ralph,
      ...overrides.ralph,
      qualityGates: { ...defaults.ralph.qualityGates, ...overrides.ralph?.qualityGates },
    },
    workspace: { ...defaults.workspace, ...overrides.workspace },
    logging: { ...defaults.logging, ...overrides.logging },
  };
}

/**
 * Create a mock log entry
 */
export function createMockLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'Test message',
    timestamp: new Date(),
    context: {},
    ...overrides,
  };
}

/**
 * Mock logger that captures log calls
 */
export class MockLogger {
  public logs: Array<{ level: LogLevel; message: string; context?: Record<string, unknown> }> = [];

  debug(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', message, context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, _error?: Error, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'error', message, context });
  }

  fatal(message: string, _error?: Error, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'fatal', message, context });
  }

  clear(): void {
    this.logs = [];
  }

  getLogsForLevel(level: LogLevel): string[] {
    return this.logs.filter((log) => log.level === level).map((log) => log.message);
  }

  hasLog(level: LogLevel, messagePattern: string | RegExp): boolean {
    return this.logs.some((log) => {
      if (log.level !== level) return false;
      if (typeof messagePattern === 'string') {
        return log.message.includes(messagePattern);
      }
      return messagePattern.test(log.message);
    });
  }
}

/**
 * Create a mock file system
 */
export function createMockFileSystem(): Map<string, string> {
  return new Map();
}

/**
 * Mock environment variables
 */
export class MockEnv {
  private original: Record<string, string | undefined> = {};
  private mocked: string[] = [];

  set(key: string, value: string): void {
    if (!this.mocked.includes(key)) {
      this.original[key] = process.env[key];
      this.mocked.push(key);
    }
    process.env[key] = value;
  }

  unset(key: string): void {
    if (!this.mocked.includes(key)) {
      this.original[key] = process.env[key];
      this.mocked.push(key);
    }
    delete process.env[key];
  }

  restore(): void {
    for (const key of this.mocked) {
      if (this.original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = this.original[key];
      }
    }
    this.mocked = [];
    this.original = {};
  }
}
