/**
 * Tests for result utilities
 */

import { describe, it, expect } from 'vitest';
import { ok, err, tryCatch, tryCatchSync, unwrap, unwrapOr, mapResult, flatMapResult } from './result.js';

describe('result utilities', () => {
  describe('ok', () => {
    it('should create a successful result', () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should work with objects', () => {
      const data = { foo: 'bar' };
      const result = ok(data);
      expect(result.success).toBe(true);
      expect(result.data).toBe(data);
    });
  });

  describe('err', () => {
    it('should create a failed result', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });

    it('should work with custom error types', () => {
      const customError = { code: 'E001', message: 'custom' };
      const result = err(customError);
      expect(result.success).toBe(false);
      expect(result.error).toEqual(customError);
    });
  });

  describe('tryCatch', () => {
    it('should return ok for successful async operations', async () => {
      const result = await tryCatch(async () => 'success');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('success');
      }
    });

    it('should return err for failed async operations', async () => {
      const result = await tryCatch(async () => {
        throw new Error('async error');
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('async error');
      }
    });

    it('should convert non-Error throws to Error', async () => {
      const result = await tryCatch(async () => {
        throw 'string error';
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('string error');
      }
    });
  });

  describe('tryCatchSync', () => {
    it('should return ok for successful sync operations', () => {
      const result = tryCatchSync(() => 42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it('should return err for failed sync operations', () => {
      const result = tryCatchSync(() => {
        throw new Error('sync error');
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('sync error');
      }
    });
  });

  describe('unwrap', () => {
    it('should return data for successful result', () => {
      const result = ok('value');
      expect(unwrap(result)).toBe('value');
    });

    it('should throw for failed result', () => {
      const result = err(new Error('test'));
      expect(() => unwrap(result)).toThrow('test');
    });
  });

  describe('unwrapOr', () => {
    it('should return data for successful result', () => {
      const result = ok('value');
      expect(unwrapOr(result, 'default')).toBe('value');
    });

    it('should return default for failed result', () => {
      const result = err(new Error('test'));
      expect(unwrapOr(result, 'default')).toBe('default');
    });
  });

  describe('mapResult', () => {
    it('should transform successful result', () => {
      const result = ok(2);
      const mapped = mapResult(result, (x) => x * 2);
      expect(mapped.success).toBe(true);
      if (mapped.success) {
        expect(mapped.data).toBe(4);
      }
    });

    it('should pass through failed result', () => {
      const error = new Error('test');
      const result = err(error);
      const mapped = mapResult(result, (x: number) => x * 2);
      expect(mapped.success).toBe(false);
      if (!mapped.success) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe('flatMapResult', () => {
    it('should chain successful results', () => {
      const result = ok(2);
      const chained = flatMapResult(result, (x) => ok(x * 2));
      expect(chained.success).toBe(true);
      if (chained.success) {
        expect(chained.data).toBe(4);
      }
    });

    it('should short-circuit on failure', () => {
      const result = ok(2);
      const chained = flatMapResult(result, () => err(new Error('chain error')));
      expect(chained.success).toBe(false);
    });

    it('should pass through initial failure', () => {
      const error = new Error('initial');
      const result = err(error);
      const chained = flatMapResult(result, (x: number) => ok(x * 2));
      expect(chained.success).toBe(false);
      if (!chained.success) {
        expect(chained.error).toBe(error);
      }
    });
  });
});
