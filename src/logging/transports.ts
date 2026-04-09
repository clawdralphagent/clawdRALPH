/**
 * Log transports for writing log output
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { dirname, join, basename } from 'path';
import type { LogLevel } from '../types/common.js';
import { stripColors } from './formatters.js';

/**
 * Log transport interface
 */
export interface LogTransport {
  write(level: LogLevel, message: string): void;
  close?(): Promise<void>;
}

/**
 * Console transport - writes to stdout/stderr
 */
export class ConsoleTransport implements LogTransport {
  private useStderr: Set<LogLevel> = new Set(['error', 'fatal']);

  write(level: LogLevel, message: string): void {
    if (this.useStderr.has(level)) {
      process.stderr.write(message + '\n');
    } else {
      process.stdout.write(message + '\n');
    }
  }
}

/**
 * File transport options
 */
export interface FileTransportOptions {
  path: string;
  maxSize?: number;
  maxFiles?: number;
}

/**
 * File transport - writes to log files with rotation
 */
export class FileTransport implements LogTransport {
  private path: string;
  private maxSize: number;
  private maxFiles: number;
  private currentSize: number = 0;

  constructor(options: FileTransportOptions) {
    this.path = options.path;
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options.maxFiles ?? 5;

    // Ensure directory exists
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Get current file size if it exists
    if (existsSync(this.path)) {
      this.currentSize = statSync(this.path).size;
    }
  }

  write(_level: LogLevel, message: string): void {
    // Strip colors for file output
    const cleanMessage = stripColors(message) + '\n';
    const messageSize = Buffer.byteLength(cleanMessage, 'utf8');

    // Check if rotation is needed
    if (this.currentSize + messageSize > this.maxSize) {
      this.rotate();
    }

    // Write to file
    try {
      appendFileSync(this.path, cleanMessage, 'utf8');
      this.currentSize += messageSize;
    } catch {
      // Silently fail if we can't write to the log file
      // We don't want logging failures to crash the application
    }
  }

  /**
   * Rotate log files
   */
  private rotate(): void {
    try {
      // Delete oldest file if it exists
      const oldestPath = this.getRotatedPath(this.maxFiles - 1);
      if (existsSync(oldestPath)) {
        unlinkSync(oldestPath);
      }

      // Rotate existing files
      for (let i = this.maxFiles - 2; i >= 0; i--) {
        const oldPath = i === 0 ? this.path : this.getRotatedPath(i);
        const newPath = this.getRotatedPath(i + 1);

        if (existsSync(oldPath)) {
          renameSync(oldPath, newPath);
        }
      }

      this.currentSize = 0;
    } catch {
      // Silently fail rotation errors
    }
  }

  /**
   * Get path for a rotated log file
   */
  private getRotatedPath(index: number): string {
    const dir = dirname(this.path);
    const name = basename(this.path);
    return join(dir, `${name}.${index}`);
  }

  async close(): Promise<void> {
    // Nothing to close for file transport
  }
}

/**
 * Null transport - discards all logs (useful for testing)
 */
export class NullTransport implements LogTransport {
  write(_level: LogLevel, _message: string): void {
    // Discard
  }
}

/**
 * Memory transport - stores logs in memory (useful for testing)
 */
export class MemoryTransport implements LogTransport {
  private logs: Array<{ level: LogLevel; message: string }> = [];
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  write(level: LogLevel, message: string): void {
    this.logs.push({ level, message: stripColors(message) });

    // Trim if over max
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-this.maxEntries);
    }
  }

  /**
   * Get all stored logs
   */
  getLogs(): Array<{ level: LogLevel; message: string }> {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   */
  getLogsForLevel(level: LogLevel): string[] {
    return this.logs.filter((log) => log.level === level).map((log) => log.message);
  }

  /**
   * Clear stored logs
   */
  clear(): void {
    this.logs = [];
  }
}
