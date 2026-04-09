/**
 * Tests for configuration loader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import JSON5 from 'json5';
import { loadConfig, validateConfig, initConfig } from './loader.js';
import { createTempDir, removeTempDir } from '../test/helpers.js';
import { validConfig, invalidConfig } from '../test/fixtures.js';

describe('configuration loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  describe('loadConfig', () => {
    it('should load default config when file does not exist', () => {
      const result = loadConfig(join(tempDir, 'nonexistent.json'));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gateway.port).toBe(18789);
      }
    });

    it('should load config from file', () => {
      const configPath = join(tempDir, 'config.json');
      writeFileSync(configPath, JSON5.stringify({ gateway: { port: 9000 } }));

      const result = loadConfig(configPath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gateway.port).toBe(9000);
      }
    });

    it('should merge with defaults', () => {
      const configPath = join(tempDir, 'config.json');
      writeFileSync(configPath, JSON5.stringify({ gateway: { port: 9000 } }));

      const result = loadConfig(configPath);
      expect(result.success).toBe(true);
      if (result.success) {
        // Custom value
        expect(result.data.gateway.port).toBe(9000);
        // Default value
        expect(result.data.gateway.bind).toBe('127.0.0.1');
      }
    });

    it('should support JSON5 syntax', () => {
      const configPath = join(tempDir, 'config.json');
      // JSON5 allows comments and trailing commas
      writeFileSync(configPath, `{
        // This is a comment
        gateway: {
          port: 8080,
        },
      }`);

      const result = loadConfig(configPath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gateway.port).toBe(8080);
      }
    });

    it('should resolve environment variables', () => {
      const configPath = join(tempDir, 'config.json');
      process.env['TEST_TOKEN'] = 'my-secret-token';
      writeFileSync(configPath, JSON5.stringify({
        gateway: { authToken: '${TEST_TOKEN}' }
      }));

      const result = loadConfig(configPath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gateway.authToken).toBe('my-secret-token');
      }

      delete process.env['TEST_TOKEN'];
    });

    it('should fail on invalid JSON', () => {
      const configPath = join(tempDir, 'config.json');
      writeFileSync(configPath, 'not valid json {{{');

      const result = loadConfig(configPath);
      expect(result.success).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should accept valid configuration', () => {
      const result = validateConfig(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid port', () => {
      const config = { ...validConfig, gateway: { ...validConfig.gateway, port: -1 } };
      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid reasoning level', () => {
      const config = { ...validConfig, models: { ...validConfig.models, reasoning: 'invalid' } };
      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    it('should provide default values for missing fields', () => {
      const result = validateConfig({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gateway.port).toBe(18789);
        expect(result.data.ralph.maxIterations).toBe(10);
      }
    });
  });

  describe('initConfig', () => {
    it('should create config file', () => {
      const configPath = join(tempDir, 'new-config.json');
      expect(existsSync(configPath)).toBe(false);

      const result = initConfig(configPath);
      expect(result.success).toBe(true);
      expect(existsSync(configPath)).toBe(true);
    });

    it('should fail if file already exists', () => {
      const configPath = join(tempDir, 'existing.json');
      writeFileSync(configPath, '{}');

      const result = initConfig(configPath);
      expect(result.success).toBe(false);
    });

    it('should create parent directories', () => {
      const configPath = join(tempDir, 'deep', 'nested', 'config.json');

      const result = initConfig(configPath);
      expect(result.success).toBe(true);
      expect(existsSync(configPath)).toBe(true);
    });
  });
});
