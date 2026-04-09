/**
 * Tests for Skill Registry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DefaultSkillRegistry,
  SkillSandbox,
  SkillRateLimiter,
} from './registry.js';
import {
  BaseSkill,
  createSkillManifest,
  createSkillContext,
  type SkillConfig,
  type SkillContext,
  type SkillResult,
  type SkillFactory,
  type SkillManifest,
} from './types.js';

// Test skill implementation
class TestSkill extends BaseSkill {
  constructor(config: SkillConfig = {}) {
    const manifest = createSkillManifest({
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill for testing',
      category: 'core',
    });

    super(manifest, config);

    // Register the tool
    this.registerTool(
      {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input value' },
          },
          required: ['input'],
        },
      },
      async (args, _context) => {
        return {
          success: true,
          output: `Result: ${args.input}`,
          data: { processed: args.input },
          duration: 10,
        };
      }
    );
  }
}

const testFactory: SkillFactory = (config) => new TestSkill(config);

const testManifest = createSkillManifest({
  id: 'test-skill',
  name: 'Test Skill',
  description: 'A test skill for testing',
  category: 'core',
});

describe('DefaultSkillRegistry', () => {
  let registry: DefaultSkillRegistry;

  beforeEach(() => {
    registry = new DefaultSkillRegistry({});
  });

  describe('registration', () => {
    it('should register a skill', () => {
      registry.register(testManifest, testFactory);
      const list = registry.list();

      expect(list).toHaveLength(1);
      expect(list[0]?.manifest.id).toBe('test-skill');
    });

    it('should overwrite on duplicate registration', () => {
      registry.register(testManifest, testFactory);
      registry.register(testManifest, testFactory);

      const list = registry.list();
      expect(list).toHaveLength(1);
    });

    it('should get skill by ID after enabling', async () => {
      registry.register(testManifest, testFactory);
      await registry.enable('test-skill');
      const skill = registry.get('test-skill');

      expect(skill).toBeDefined();
    });

    it('should return undefined for unknown skill', () => {
      const skill = registry.get('unknown-skill');
      expect(skill).toBeUndefined();
    });

    it('should check if skill exists via list', () => {
      registry.register(testManifest, testFactory);

      const list = registry.list();
      const exists = list.some((r) => r.manifest.id === 'test-skill');
      expect(exists).toBe(true);
    });
  });

  describe('enabling/disabling', () => {
    beforeEach(() => {
      registry.register(testManifest, testFactory);
    });

    it('should enable a skill', async () => {
      await registry.enable('test-skill');
      const skill = registry.get('test-skill');

      expect(skill).toBeDefined();
      expect(skill?.status).toBe('enabled');
    });

    it('should enable skill with config', async () => {
      await registry.enable('test-skill', { timeout: 5000 });
      const skill = registry.get('test-skill');

      expect(skill).toBeDefined();
    });

    it('should disable a skill', async () => {
      await registry.enable('test-skill');
      await registry.disable('test-skill');
      const skill = registry.get('test-skill');

      expect(skill?.status).toBe('disabled');
    });

    it('should throw when enabling unknown skill', async () => {
      await expect(registry.enable('unknown-skill')).rejects.toThrow(
        'Skill not found'
      );
    });

    it('should handle disabling unknown skill gracefully', async () => {
      // Disabling an unknown skill doesn't throw - it just returns
      await registry.disable('unknown-skill');
      // No error thrown
    });

    it('should not re-enable already enabled skill', async () => {
      await registry.enable('test-skill');
      const skill1 = registry.get('test-skill');

      await registry.enable('test-skill');
      const skill2 = registry.get('test-skill');

      // Same instance should be returned
      expect(skill1).toBe(skill2);
    });
  });

  describe('tool execution', () => {
    beforeEach(async () => {
      registry.register(testManifest, testFactory);
      await registry.enable('test-skill');
    });

    it('should execute tool', async () => {
      const context = createSkillContext({});
      const result = await registry.execute('test_tool', { input: 'hello' }, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Result: hello');
    });

    it('should return error result for unknown tool', async () => {
      const context = createSkillContext({});
      const result = await registry.execute('unknown_tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('unknown_tool');
    });

    it('should return error result for disabled skill tool', async () => {
      await registry.disable('test-skill');
      const context = createSkillContext({});

      // After disabling, the tool mapping is removed, so it's "not found"
      const result = await registry.execute('test_tool', { input: 'hello' }, context);
      expect(result.success).toBe(false);
    });
  });

  describe('getTools', () => {
    it('should return tools from enabled skills', async () => {
      registry.register(testManifest, testFactory);
      await registry.enable('test-skill');

      const tools = registry.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]?.definition.name).toBe('test_tool');
    });

    it('should not return tools from disabled skills', () => {
      registry.register(testManifest, testFactory);

      const tools = registry.getTools();
      expect(tools).toHaveLength(0);
    });

    it('should return tools with handlers', async () => {
      registry.register(testManifest, testFactory);
      await registry.enable('test-skill');

      const tools = registry.getTools();
      expect(tools[0]?.handler).toBeDefined();
      expect(typeof tools[0]?.handler).toBe('function');
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty registry', () => {
      const stats = registry.getStats();

      expect(stats.total).toBe(0);
      expect(stats.enabled).toBe(0);
      expect(stats.disabled).toBe(0);
      expect(stats.error).toBe(0);
      expect(stats.tools).toBe(0);
    });

    it('should return correct stats after enabling', async () => {
      registry.register(testManifest, testFactory);
      await registry.enable('test-skill');

      const stats = registry.getStats();

      expect(stats.total).toBe(1);
      expect(stats.enabled).toBe(1);
      expect(stats.disabled).toBe(0);
      expect(stats.tools).toBe(1);
    });

    it('should return correct stats after disabling', async () => {
      registry.register(testManifest, testFactory);
      await registry.enable('test-skill');
      await registry.disable('test-skill');

      const stats = registry.getStats();

      expect(stats.total).toBe(1);
      expect(stats.enabled).toBe(0);
      expect(stats.disabled).toBe(1);
    });
  });

  describe('list', () => {
    it('should list all registered skills', () => {
      registry.register(testManifest, testFactory);

      const secondManifest = createSkillManifest({
        id: 'test-skill-2',
        name: 'Test Skill 2',
        description: 'Another test skill',
        category: 'core',
      });
      registry.register(secondManifest, (config) => new TestSkill(config));

      const list = registry.list();
      expect(list).toHaveLength(2);
    });
  });
});

describe('SkillSandbox', () => {
  it('should create with default options', () => {
    const sandbox = new SkillSandbox();
    expect(sandbox).toBeDefined();
  });

  it('should create with custom options', () => {
    const sandbox = new SkillSandbox({
      filesystem: { allowRead: [] },
      network: { allowHosts: [] },
    });
    expect(sandbox).toBeDefined();
  });

  it('should check filesystem read access', () => {
    const sandbox = new SkillSandbox({
      filesystem: { allowRead: ['/home'] },
    });

    expect(sandbox.isPathAllowed('/home/user/file.txt', 'read')).toBe(true);
    expect(sandbox.isPathAllowed('/etc/passwd', 'read')).toBe(false);
  });

  it('should check filesystem write access', () => {
    // With specific allowWrite paths, only those paths are allowed
    const sandbox = new SkillSandbox({
      filesystem: { allowWrite: ['/allowed'] },
    });

    expect(sandbox.isPathAllowed('/allowed/file.txt', 'write')).toBe(true);
    expect(sandbox.isPathAllowed('/other/path', 'write')).toBe(false);
  });

  it('should allow all writes when no allowWrite specified', () => {
    const sandbox = new SkillSandbox({});
    expect(sandbox.isPathAllowed('/any/path', 'write')).toBe(true);
  });

  it('should check command allowlist', () => {
    const sandbox = new SkillSandbox({
      process: { allowCommands: ['ls', 'cat'] },
    });

    expect(sandbox.isCommandAllowed('ls -la')).toBe(true);
    expect(sandbox.isCommandAllowed('rm -rf /')).toBe(false);
  });

  it('should check command denylist', () => {
    const sandbox = new SkillSandbox({
      process: { denyCommands: ['rm', 'sudo'] },
    });

    expect(sandbox.isCommandAllowed('rm -rf /')).toBe(false);
    expect(sandbox.isCommandAllowed('sudo anything')).toBe(false);
    expect(sandbox.isCommandAllowed('ls -la')).toBe(true);
  });

  it('should create sandboxed context', () => {
    const sandbox = new SkillSandbox();
    const baseContext = createSkillContext({});

    const sandboxedContext = sandbox.createContext(baseContext);
    expect(sandboxedContext).toBeDefined();
    expect(sandboxedContext.workingDir).toBeDefined();
  });
});

describe('SkillRateLimiter', () => {
  const MAX_REQUESTS = 5;
  const WINDOW_MS = 1000;

  it('should create limiter', () => {
    const limiter = new SkillRateLimiter();
    expect(limiter).toBeDefined();
  });

  it('should allow requests within limit', () => {
    const limiter = new SkillRateLimiter();

    for (let i = 0; i < MAX_REQUESTS; i++) {
      expect(limiter.isAllowed('skill-1', MAX_REQUESTS, WINDOW_MS)).toBe(true);
    }
  });

  it('should block requests over limit', () => {
    const limiter = new SkillRateLimiter();
    const maxRequests = 3;

    for (let i = 0; i < maxRequests; i++) {
      limiter.isAllowed('skill-1', maxRequests, WINDOW_MS);
    }

    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(false);
  });

  it('should track different skills separately', () => {
    const limiter = new SkillRateLimiter();
    const maxRequests = 2;

    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(true);
    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(true);
    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(false);

    expect(limiter.isAllowed('skill-2', maxRequests, WINDOW_MS)).toBe(true);
  });

  it('should reset after window expires', async () => {
    const limiter = new SkillRateLimiter();
    const maxRequests = 2;
    const windowMs = 50; // 50ms window

    limiter.isAllowed('skill-1', maxRequests, windowMs);
    limiter.isAllowed('skill-1', maxRequests, windowMs);
    expect(limiter.isAllowed('skill-1', maxRequests, windowMs)).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(limiter.isAllowed('skill-1', maxRequests, windowMs)).toBe(true);
  });

  it('should return remaining requests', () => {
    const limiter = new SkillRateLimiter();

    expect(limiter.getRemaining('skill-1', MAX_REQUESTS, WINDOW_MS)).toBe(MAX_REQUESTS);

    limiter.isAllowed('skill-1', MAX_REQUESTS, WINDOW_MS);
    expect(limiter.getRemaining('skill-1', MAX_REQUESTS, WINDOW_MS)).toBe(MAX_REQUESTS - 1);

    limiter.isAllowed('skill-1', MAX_REQUESTS, WINDOW_MS);
    expect(limiter.getRemaining('skill-1', MAX_REQUESTS, WINDOW_MS)).toBe(MAX_REQUESTS - 2);
  });

  it('should clear skill limit', () => {
    const limiter = new SkillRateLimiter();
    const maxRequests = 2;

    limiter.isAllowed('skill-1', maxRequests, WINDOW_MS);
    limiter.isAllowed('skill-1', maxRequests, WINDOW_MS);
    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(false);

    limiter.clear('skill-1');
    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(true);
  });

  it('should clear all limits', () => {
    const limiter = new SkillRateLimiter();
    const maxRequests = 1;

    limiter.isAllowed('skill-1', maxRequests, WINDOW_MS);
    limiter.isAllowed('skill-2', maxRequests, WINDOW_MS);

    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(false);
    expect(limiter.isAllowed('skill-2', maxRequests, WINDOW_MS)).toBe(false);

    limiter.clearAll();

    expect(limiter.isAllowed('skill-1', maxRequests, WINDOW_MS)).toBe(true);
    expect(limiter.isAllowed('skill-2', maxRequests, WINDOW_MS)).toBe(true);
  });
});
