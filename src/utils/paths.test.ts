/**
 * Tests for path utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import {
  getHomeDir,
  expandTilde,
  getDataDir,
  getConfigPath,
  ensureDir,
  isPathAllowed,
} from './paths.js';

describe('path utilities', () => {
  describe('getHomeDir', () => {
    it('should return the home directory', () => {
      expect(getHomeDir()).toBe(homedir());
    });
  });

  describe('expandTilde', () => {
    it('should expand ~/ to home directory', () => {
      const result = expandTilde('~/projects');
      expect(result).toBe(join(homedir(), 'projects'));
    });

    it('should expand lone ~ to home directory', () => {
      const result = expandTilde('~');
      expect(result).toBe(homedir());
    });

    it('should not modify paths without tilde', () => {
      const result = expandTilde('/absolute/path');
      expect(result).toBe('/absolute/path');
    });

    it('should not modify relative paths', () => {
      const result = expandTilde('relative/path');
      expect(result).toBe('relative/path');
    });

    it('should not expand tilde in the middle of path', () => {
      const result = expandTilde('/path/to/~/file');
      expect(result).toBe('/path/to/~/file');
    });
  });

  describe('getDataDir', () => {
    const originalEnv = process.env['CLAWDRALPH_DATA_DIR'];

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env['CLAWDRALPH_DATA_DIR'];
      } else {
        process.env['CLAWDRALPH_DATA_DIR'] = originalEnv;
      }
    });

    it('should return default data directory', () => {
      delete process.env['CLAWDRALPH_DATA_DIR'];
      const result = getDataDir();
      expect(result).toBe(join(homedir(), '.clawdralph'));
    });

    it('should respect CLAWDRALPH_DATA_DIR env var', () => {
      process.env['CLAWDRALPH_DATA_DIR'] = '/custom/data';
      const result = getDataDir();
      expect(result).toBe('/custom/data');
    });
  });

  describe('getConfigPath', () => {
    const originalEnv = process.env['CLAWDRALPH_CONFIG'];

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env['CLAWDRALPH_CONFIG'];
      } else {
        process.env['CLAWDRALPH_CONFIG'] = originalEnv;
      }
    });

    it('should return default config path', () => {
      delete process.env['CLAWDRALPH_CONFIG'];
      delete process.env['CLAWDRALPH_DATA_DIR'];
      const result = getConfigPath();
      expect(result).toContain('config.json');
    });

    it('should respect CLAWDRALPH_CONFIG env var', () => {
      process.env['CLAWDRALPH_CONFIG'] = '/custom/config.json';
      const result = getConfigPath();
      expect(result).toBe('/custom/config.json');
    });
  });

  describe('ensureDir', () => {
    const testDir = join(homedir(), '.clawdralph-test-' + Date.now());

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    it('should create directory if it does not exist', () => {
      expect(existsSync(testDir)).toBe(false);
      ensureDir(testDir);
      expect(existsSync(testDir)).toBe(true);
    });

    it('should not throw if directory already exists', () => {
      mkdirSync(testDir, { recursive: true });
      expect(() => ensureDir(testDir)).not.toThrow();
    });

    it('should create nested directories', () => {
      const nestedDir = join(testDir, 'a', 'b', 'c');
      ensureDir(nestedDir);
      expect(existsSync(nestedDir)).toBe(true);
    });
  });

  describe('isPathAllowed', () => {
    it('should allow paths within allowed directories', () => {
      const allowed = ['/home/user/projects', '/home/user/work'];
      expect(isPathAllowed('/home/user/projects/myapp', allowed)).toBe(true);
      expect(isPathAllowed('/home/user/work/task', allowed)).toBe(true);
    });

    it('should reject paths outside allowed directories', () => {
      const allowed = ['/home/user/projects'];
      expect(isPathAllowed('/home/user/secrets', allowed)).toBe(false);
      expect(isPathAllowed('/etc/passwd', allowed)).toBe(false);
    });

    it('should handle tilde paths', () => {
      const allowed = ['~/projects'];
      expect(isPathAllowed('~/projects/myapp', allowed)).toBe(true);
    });

    it('should allow exact directory match', () => {
      const allowed = ['/home/user/projects'];
      expect(isPathAllowed('/home/user/projects', allowed)).toBe(true);
    });
  });
});
