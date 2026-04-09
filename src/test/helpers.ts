/**
 * Test helper functions
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

/**
 * Create a temporary directory for testing
 */
export function createTempDir(prefix = 'clawdralph-test-'): string {
  const dirName = `${prefix}${randomBytes(8).toString('hex')}`;
  const dirPath = join(tmpdir(), dirName);
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Remove a temporary directory
 */
export function removeTempDir(dirPath: string): void {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Create a temporary file with content
 */
export function createTempFile(dirPath: string, fileName: string, content: string): string {
  const filePath = join(dirPath, fileName);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Capture console output during a function call
 */
export async function captureOutput(
  fn: () => void | Promise<void>
): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    stdout.push(chunk.toString());
    return true;
  };

  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    stderr.push(chunk.toString());
    return true;
  };

  try {
    await fn();
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  return {
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  };
}

/**
 * Create a deferred promise for testing async operations
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Run a function with a timeout
 */
export async function withTestTimeout<T>(
  fn: () => Promise<T>,
  timeout = 5000
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout)
    ),
  ]);
}

/**
 * Assert that a function throws a specific error
 */
export async function assertThrowsAsync(
  fn: () => Promise<unknown>,
  messagePattern?: string | RegExp
): Promise<Error> {
  let caughtError: Error | null = null;

  try {
    await fn();
  } catch (error) {
    caughtError = error instanceof Error ? error : new Error(String(error));
  }

  if (caughtError === null) {
    throw new Error('Expected function to throw');
  }

  if (messagePattern) {
    const matches =
      typeof messagePattern === 'string'
        ? caughtError.message.includes(messagePattern)
        : messagePattern.test(caughtError.message);

    if (!matches) {
      throw new Error(
        `Expected error message to match ${messagePattern}, got "${caughtError.message}"`
      );
    }
  }

  return caughtError;
}
