/**
 * Log formatters
 */

import chalk from 'chalk';
import type { LogLevel, LogEntry } from '../types/common.js';

/**
 * Color mapping for log levels
 */
const LEVEL_COLORS: Record<LogLevel, (text: string) => string> = {
  debug: chalk.gray,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
  fatal: chalk.bgRed.white,
};

/**
 * Level labels
 */
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  fatal: 'FATAL',
};

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Format ISO timestamp
 */
export function formatISOTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Format context object for display
 */
export function formatContext(context: Record<string, unknown>): string {
  const entries = Object.entries(context);
  if (entries.length === 0) {
    return '';
  }

  const parts = entries.map(([key, value]) => {
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${chalk.cyan(key)}=${valueStr}`;
  });

  return ` ${parts.join(' ')}`;
}

/**
 * Format error for display
 */
export function formatError(error: Error): string {
  const lines = [chalk.red(`  Error: ${error.message}`)];

  if (error.stack) {
    const stackLines = error.stack.split('\n').slice(1, 6);
    lines.push(...stackLines.map((line) => chalk.gray(`  ${line.trim()}`)));
  }

  return lines.join('\n');
}

/**
 * Format a log entry for console output
 */
export function formatLogEntry(entry: LogEntry): string {
  const timestamp = chalk.gray(formatTimestamp(entry.timestamp));
  const level = LEVEL_COLORS[entry.level](LEVEL_LABELS[entry.level]);
  const message = entry.message;
  const context = entry.context ? formatContext(entry.context) : '';

  let output = `${timestamp} ${level} ${message}${context}`;

  if (entry.error) {
    output += '\n' + formatError(entry.error);
  }

  return output;
}

/**
 * Format a log entry as JSON
 */
export function formatJson(entry: LogEntry): string {
  const obj: Record<string, unknown> = {
    timestamp: formatISOTimestamp(entry.timestamp),
    level: entry.level,
    message: entry.message,
  };

  if (entry.context && Object.keys(entry.context).length > 0) {
    obj['context'] = entry.context;
  }

  if (entry.error) {
    obj['error'] = {
      name: entry.error.name,
      message: entry.error.message,
      stack: entry.error.stack,
    };
  }

  return JSON.stringify(obj);
}

/**
 * Strip ANSI color codes from a string
 */
export function stripColors(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
