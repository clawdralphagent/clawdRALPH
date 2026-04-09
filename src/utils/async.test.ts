/**
 * Tests for async utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { sleep, withTimeout, retry, debounce, throttle, deferred, parallelLimit } from './async.js';

describe('async utilities', () => {
  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow small margin
    });
  });

  describe('withTimeout', () => {
    it('should resolve if operation completes in time', async () => {
      const result = await withTimeout(
        Promise.resolve('success'),
        1000
      );
      expect(result).toBe('success');
    });

    it('should reject if operation times out', async () => {
      await expect(
        withTimeout(
          new Promise((resolve) => setTimeout(resolve, 200)),
          50
        )
      ).rejects.toThrow('Operation timed out');
    });

    it('should use custom error message', async () => {
      await expect(
        withTimeout(
          new Promise((resolve) => setTimeout(resolve, 200)),
          50,
          'Custom timeout message'
        )
      ).rejects.toThrow('Custom timeout message');
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(fn, { baseDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(
        retry(fn, { maxAttempts: 3, baseDelay: 10 })
      ).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect shouldRetry condition', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fatal error'));

      await expect(
        retry(fn, {
          maxAttempts: 5,
          baseDelay: 10,
          shouldRetry: (error) => !(error as Error).message.includes('fatal'),
        })
      ).rejects.toThrow('fatal error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('debounce', () => {
    it('should only call function once after delay', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced();
      debounced();
      debounced();

      expect(fn).not.toHaveBeenCalled();
      await sleep(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to debounced function', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced('arg1', 'arg2');
      await sleep(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle', () => {
    it('should call function immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not call function again within throttle period', async () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call function again after throttle period', async () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 50);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);

      await sleep(100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('deferred', () => {
    it('should create a resolvable promise', async () => {
      const { promise, resolve } = deferred<string>();

      setTimeout(() => resolve('done'), 10);
      const result = await promise;

      expect(result).toBe('done');
    });

    it('should create a rejectable promise', async () => {
      const { promise, reject } = deferred<string>();

      setTimeout(() => reject(new Error('failed')), 10);

      await expect(promise).rejects.toThrow('failed');
    });
  });

  describe('parallelLimit', () => {
    it('should process all items', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await parallelLimit(items, async (item) => item * 2, 2);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should respect concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      const items = [1, 2, 3, 4, 5];

      await parallelLimit(
        items,
        async (item) => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await sleep(50);
          concurrent--;
          return item;
        },
        2
      );

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should handle empty array', async () => {
      const results = await parallelLimit([], async (item: number) => item, 2);
      expect(results).toEqual([]);
    });
  });
});
