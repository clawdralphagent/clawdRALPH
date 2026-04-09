/**
 * Tests for browser tool definitions
 */

import { describe, it, expect } from 'vitest';
import {
  browserTools,
  getBrowserToolDefinitions,
  getBrowserToolHandler,
} from './tools.js';

describe('browser tools', () => {
  describe('browserTools array', () => {
    it('should contain all expected tools', () => {
      const toolNames = browserTools.map((t) => t.definition.name);

      expect(toolNames).toContain('browser_launch');
      expect(toolNames).toContain('browser_navigate');
      expect(toolNames).toContain('browser_click');
      expect(toolNames).toContain('browser_type');
      expect(toolNames).toContain('browser_screenshot');
      expect(toolNames).toContain('browser_get_content');
      expect(toolNames).toContain('browser_wait');
      expect(toolNames).toContain('browser_evaluate');
      expect(toolNames).toContain('browser_verify');
      expect(toolNames).toContain('browser_close');
      expect(toolNames).toContain('browser_snapshot');
    });

    it('should have valid tool definitions', () => {
      for (const tool of browserTools) {
        expect(tool.definition.name).toBeTruthy();
        expect(tool.definition.description).toBeTruthy();
        expect(tool.definition.parameters).toBeDefined();
        expect(tool.definition.parameters.type).toBe('object');
        expect(tool.handler).toBeTypeOf('function');
      }
    });
  });

  describe('getBrowserToolDefinitions', () => {
    it('should return all tool definitions', () => {
      const definitions = getBrowserToolDefinitions();

      expect(definitions.length).toBe(browserTools.length);

      for (const def of definitions) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
      }
    });
  });

  describe('getBrowserToolHandler', () => {
    it('should return handler for existing tool', () => {
      const handler = getBrowserToolHandler('browser_launch');
      expect(handler).toBeDefined();
      expect(handler).toBeTypeOf('function');
    });

    it('should return undefined for non-existent tool', () => {
      const handler = getBrowserToolHandler('nonexistent_tool');
      expect(handler).toBeUndefined();
    });

    it('should return handlers for all tools', () => {
      for (const tool of browserTools) {
        const handler = getBrowserToolHandler(tool.definition.name);
        expect(handler).toBeDefined();
        expect(handler).toBe(tool.handler);
      }
    });
  });

  describe('tool definitions structure', () => {
    it('browser_launch should have correct parameters', () => {
      const tool = browserTools.find((t) => t.definition.name === 'browser_launch');
      expect(tool).toBeDefined();

      const params = tool!.definition.parameters.properties;
      expect(params.headless).toBeDefined();
      expect(params.browserType).toBeDefined();
    });

    it('browser_navigate should require url', () => {
      const tool = browserTools.find((t) => t.definition.name === 'browser_navigate');
      expect(tool).toBeDefined();

      const params = tool!.definition.parameters;
      expect(params.properties.url).toBeDefined();
      expect(params.required).toContain('url');
    });

    it('browser_click should require selector', () => {
      const tool = browserTools.find((t) => t.definition.name === 'browser_click');
      expect(tool).toBeDefined();

      const params = tool!.definition.parameters;
      expect(params.properties.selector).toBeDefined();
      expect(params.required).toContain('selector');
    });

    it('browser_type should require selector and text', () => {
      const tool = browserTools.find((t) => t.definition.name === 'browser_type');
      expect(tool).toBeDefined();

      const params = tool!.definition.parameters;
      expect(params.properties.selector).toBeDefined();
      expect(params.properties.text).toBeDefined();
      expect(params.required).toContain('selector');
      expect(params.required).toContain('text');
    });

    it('browser_evaluate should require script', () => {
      const tool = browserTools.find((t) => t.definition.name === 'browser_evaluate');
      expect(tool).toBeDefined();

      const params = tool!.definition.parameters;
      expect(params.properties.script).toBeDefined();
      expect(params.required).toContain('script');
    });
  });

  describe('tool handlers error handling', () => {
    it('browser_navigate should fail without active session', async () => {
      const handler = getBrowserToolHandler('browser_navigate');
      expect(handler).toBeDefined();

      const context = {
        conversationId: 'test',
        metadata: {},
      };

      const result = await handler!({ url: 'https://example.com' }, context);
      expect(result.success).toBe(false);
      expect(result.content).toContain('No active browser session');
    });

    it('browser_click should fail without active session', async () => {
      const handler = getBrowserToolHandler('browser_click');
      expect(handler).toBeDefined();

      const context = {
        conversationId: 'test',
        metadata: {},
      };

      const result = await handler!({ selector: '#button' }, context);
      expect(result.success).toBe(false);
      expect(result.content).toContain('No active browser session');
    });

    it('browser_close should succeed without active session', async () => {
      const handler = getBrowserToolHandler('browser_close');
      expect(handler).toBeDefined();

      const context = {
        conversationId: 'test',
        metadata: {},
      };

      const result = await handler!({}, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('No active browser session');
    });
  });
});
