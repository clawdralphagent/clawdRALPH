/**
 * Tests for browser types and Zod schemas
 */

import { describe, it, expect } from 'vitest';
import {
  BrowserConfigSchema,
  ScreenshotOptionsSchema,
  LocatorOptionsSchema,
  NavigationOptionsSchema,
  ClickOptionsSchema,
  TypeOptionsSchema,
  DevServerConfigSchema,
} from './types.js';

describe('browser type schemas', () => {
  describe('BrowserConfigSchema', () => {
    it('should provide defaults for empty object', () => {
      const result = BrowserConfigSchema.parse({});
      expect(result.browserType).toBe('chromium');
      expect(result.mode).toBe('headless');
      expect(result.defaultTimeout).toBe(30000);
      expect(result.defaultNavigationTimeout).toBe(60000);
      expect(result.viewport.width).toBe(1280);
      expect(result.viewport.height).toBe(720);
    });

    it('should accept valid browser types', () => {
      expect(BrowserConfigSchema.parse({ browserType: 'chromium' }).browserType).toBe('chromium');
      expect(BrowserConfigSchema.parse({ browserType: 'firefox' }).browserType).toBe('firefox');
      expect(BrowserConfigSchema.parse({ browserType: 'webkit' }).browserType).toBe('webkit');
    });

    it('should reject invalid browser types', () => {
      expect(() => BrowserConfigSchema.parse({ browserType: 'safari' })).toThrow();
    });

    it('should accept custom viewport', () => {
      const result = BrowserConfigSchema.parse({
        viewport: { width: 1920, height: 1080 },
      });
      expect(result.viewport.width).toBe(1920);
      expect(result.viewport.height).toBe(1080);
    });

    it('should accept extra args', () => {
      const result = BrowserConfigSchema.parse({
        extraArgs: ['--disable-gpu', '--no-sandbox'],
      });
      expect(result.extraArgs).toHaveLength(2);
    });
  });

  describe('ScreenshotOptionsSchema', () => {
    it('should provide defaults', () => {
      const result = ScreenshotOptionsSchema.parse({});
      expect(result.type).toBe('png');
      expect(result.fullPage).toBe(false);
      expect(result.omitBackground).toBe(false);
    });

    it('should accept jpeg with quality', () => {
      const result = ScreenshotOptionsSchema.parse({
        type: 'jpeg',
        quality: 80,
      });
      expect(result.type).toBe('jpeg');
      expect(result.quality).toBe(80);
    });

    it('should accept clip region', () => {
      const result = ScreenshotOptionsSchema.parse({
        clip: { x: 0, y: 0, width: 100, height: 100 },
      });
      expect(result.clip).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });
  });

  describe('LocatorOptionsSchema', () => {
    it('should require selector', () => {
      const result = LocatorOptionsSchema.parse({ selector: '#my-element' });
      expect(result.selector).toBe('#my-element');
      expect(result.strategy).toBe('css');
    });

    it('should accept different strategies', () => {
      const strategies = ['css', 'xpath', 'text', 'role', 'testid'] as const;
      for (const strategy of strategies) {
        const result = LocatorOptionsSchema.parse({
          selector: 'test',
          strategy,
        });
        expect(result.strategy).toBe(strategy);
      }
    });
  });

  describe('NavigationOptionsSchema', () => {
    it('should require valid URL', () => {
      const result = NavigationOptionsSchema.parse({
        url: 'https://example.com',
      });
      expect(result.url).toBe('https://example.com');
      expect(result.waitUntil).toBe('load');
    });

    it('should reject invalid URL', () => {
      expect(() =>
        NavigationOptionsSchema.parse({ url: 'not-a-url' })
      ).toThrow();
    });

    it('should accept different waitUntil values', () => {
      const values = ['domcontentloaded', 'load', 'networkidle'] as const;
      for (const waitUntil of values) {
        const result = NavigationOptionsSchema.parse({
          url: 'https://example.com',
          waitUntil,
        });
        expect(result.waitUntil).toBe(waitUntil);
      }
    });
  });

  describe('ClickOptionsSchema', () => {
    it('should provide defaults', () => {
      const result = ClickOptionsSchema.parse({});
      expect(result.button).toBe('left');
      expect(result.clickCount).toBe(1);
      expect(result.delay).toBe(0);
      expect(result.force).toBe(false);
      expect(result.modifiers).toEqual([]);
    });

    it('should accept right click', () => {
      const result = ClickOptionsSchema.parse({ button: 'right' });
      expect(result.button).toBe('right');
    });

    it('should accept modifiers', () => {
      const result = ClickOptionsSchema.parse({
        modifiers: ['Alt', 'Control'],
      });
      expect(result.modifiers).toContain('Alt');
      expect(result.modifiers).toContain('Control');
    });
  });

  describe('TypeOptionsSchema', () => {
    it('should require text', () => {
      const result = TypeOptionsSchema.parse({ text: 'hello world' });
      expect(result.text).toBe('hello world');
      expect(result.delay).toBe(0);
      expect(result.clear).toBe(false);
    });

    it('should accept delay', () => {
      const result = TypeOptionsSchema.parse({
        text: 'slow typing',
        delay: 100,
      });
      expect(result.delay).toBe(100);
    });
  });

  describe('DevServerConfigSchema', () => {
    it('should provide defaults', () => {
      const result = DevServerConfigSchema.parse({});
      expect(result.autoDetect).toBe(true);
      expect(result.host).toBe('localhost');
      expect(result.waitForReady).toBe(true);
      expect(result.readyTimeout).toBe(60000);
    });

    it('should accept custom port', () => {
      const result = DevServerConfigSchema.parse({ port: 8080 });
      expect(result.port).toBe(8080);
    });

    it('should accept custom command', () => {
      const result = DevServerConfigSchema.parse({
        command: 'npm run serve',
      });
      expect(result.command).toBe('npm run serve');
    });
  });
});
