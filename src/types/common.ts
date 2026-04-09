/**
 * Common types used throughout clawdRALPH
 */

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async result helper
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Log levels supported by the logging system
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
}

/**
 * Event emitter callback type
 */
export type EventCallback<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Disposable resource interface
 */
export interface Disposable {
  dispose(): void | Promise<void>;
}

/**
 * Service lifecycle interface
 */
export interface Service extends Disposable {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

/**
 * Version information
 */
export interface VersionInfo {
  version: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

/**
 * CLI context passed to commands
 */
export interface CLIContext {
  configPath: string;
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
}

/**
 * Command metadata
 */
export interface CommandMeta {
  name: string;
  description: string;
  aliases?: string[];
}
