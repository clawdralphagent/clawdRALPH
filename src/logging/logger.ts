/**
 * Structured logging system for clawdRALPH
 */

import type { LogLevel, LogEntry } from '../types/common.js';
import type { LoggingConfig } from '../types/config.js';
import { ConsoleTransport, FileTransport, type LogTransport } from './transports.js';
import { formatLogEntry, formatJson } from './formatters.js';

/**
 * Log level priority (lower = more important)
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Logger class for structured logging
 */
export class Logger {
  private level: LogLevel;
  private transports: LogTransport[] = [];
  private context: Record<string, unknown> = {};
  private jsonFormat: boolean;

  constructor(config: Partial<LoggingConfig> = {}) {
    this.level = config.level ?? 'info';
    this.jsonFormat = config.json ?? false;

    // Add console transport by default
    this.transports.push(new ConsoleTransport());

    // Add file transport if configured
    if (config.file) {
      this.transports.push(
        new FileTransport({
          path: config.file,
          maxSize: config.maxSize,
          maxFiles: config.maxFiles,
        })
      );
    }
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  /**
   * Format and write a log entry
   */
  private write(entry: LogEntry): void {
    const message = this.jsonFormat ? formatJson(entry) : formatLogEntry(entry);

    for (const transport of this.transports) {
      transport.write(entry.level, message);
    }
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date(),
      context: { ...this.context, ...context },
      error,
    };
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.write(this.createEntry('debug', message, context));
    }
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.write(this.createEntry('info', message, context));
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.write(this.createEntry('warn', message, context));
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorObj = error instanceof Error ? error : undefined;
      this.write(this.createEntry('error', message, context, errorObj));
    }
  }

  /**
   * Log a fatal message
   */
  fatal(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog('fatal')) {
      const errorObj = error instanceof Error ? error : undefined;
      this.write(this.createEntry('fatal', message, context, errorObj));
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger({ level: this.level, json: this.jsonFormat });
    childLogger.context = { ...this.context, ...context };
    childLogger.transports = this.transports;
    return childLogger;
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Add a transport
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Close all transports
   */
  async close(): Promise<void> {
    for (const transport of this.transports) {
      await transport.close?.();
    }
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * Initialize the global logger with configuration
 */
export function initLogger(config: Partial<LoggingConfig>): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}

/**
 * Create a named logger (child of global)
 */
export function createLogger(name: string): Logger {
  return getLogger().child({ logger: name });
}
