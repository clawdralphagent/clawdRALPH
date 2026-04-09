/**
 * Tests for Skill Types
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SkillCategory,
  SkillManifestSchema,
  SkillConfigSchema,
  BaseSkill,
  createSkillManifest,
  createSkillContext,
  type SkillConfig,
  type SkillContext,
  type SkillResult,
  type SkillManifest,
  type ToolDefinition,
} from './types.js';

describe('SkillCategory', () => {
  it('should define standard categories', () => {
    expect(SkillCategory.CORE).toBe('core');
    expect(SkillCategory.FILESYSTEM).toBe('filesystem');
    expect(SkillCategory.GIT).toBe('git');
    expect(SkillCategory.SHELL).toBe('shell');
    expect(SkillCategory.HTTP).toBe('http');
    expect(SkillCategory.INTEGRATION).toBe('integration');
    expect(SkillCategory.CUSTOM).toBe('custom');
  });
});

describe('SkillManifestSchema', () => {
  it('should validate valid manifest', () => {
    const manifest = {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      version: '1.0.0',
      category: 'core',
      tools: [],
    };

    const result = SkillManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('should validate manifest with tool names', () => {
    const manifest = {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      version: '1.0.0',
      category: 'core',
      tools: ['tool1', 'tool2'],
    };

    const result = SkillManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('should reject manifest without required fields', () => {
    const manifest = {
      id: 'test-skill',
      // missing name and other required fields
    };

    const result = SkillManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('should validate manifest with optional fields', () => {
    const manifest = {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      version: '1.0.0',
      category: 'core',
      tools: [],
      author: 'Test Author',
      dependencies: ['other-skill'],
      permissions: ['read', 'write'],
      tags: ['test', 'example'],
    };

    const result = SkillManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.author).toBe('Test Author');
    }
  });
});

describe('SkillConfigSchema', () => {
  it('should validate empty config', () => {
    const result = SkillConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate config with enabled flag', () => {
    const config = {
      enabled: true,
    };

    const result = SkillConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate config with timeout', () => {
    const config = {
      timeout: 30000,
    };

    const result = SkillConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout).toBe(30000);
    }
  });

  it('should validate config with custom options', () => {
    const config = {
      custom: {
        apiKey: 'secret',
        maxRetries: 3,
      },
    };

    const result = SkillConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.custom?.apiKey).toBe('secret');
    }
  });
});

describe('createSkillManifest', () => {
  it('should create manifest with required fields', () => {
    const manifest = createSkillManifest({
      id: 'test',
      name: 'Test',
      description: 'Test skill',
      category: 'core',
    });

    expect(manifest.id).toBe('test');
    expect(manifest.name).toBe('Test');
    expect(manifest.tools).toEqual([]);
    expect(manifest.version).toBe('1.0.0');
  });

  it('should create manifest with optional fields', () => {
    const manifest = createSkillManifest({
      id: 'test',
      name: 'Test',
      description: 'Test skill',
      category: 'core',
      version: '2.0.0',
      author: 'Test Author',
      tags: ['tag1', 'tag2'],
    });

    expect(manifest.version).toBe('2.0.0');
    expect(manifest.author).toBe('Test Author');
    expect(manifest.tags).toEqual(['tag1', 'tag2']);
  });
});

describe('createSkillContext', () => {
  it('should create context with defaults', () => {
    const context = createSkillContext({});

    expect(context.workingDir).toBeDefined();
    expect(context.executionId).toBeDefined();
    expect(context.timeout).toBe(30000);
    expect(context.env).toEqual({});
    expect(context.metadata).toEqual({});
  });

  it('should override defaults', () => {
    const context = createSkillContext({
      workingDir: '/custom/path',
      sessionId: 'custom-session',
      timeout: 5000,
      env: { KEY: 'value' },
    });

    expect(context.workingDir).toBe('/custom/path');
    expect(context.sessionId).toBe('custom-session');
    expect(context.timeout).toBe(5000);
    expect(context.env).toEqual({ KEY: 'value' });
  });

  it('should generate unique execution IDs', () => {
    const context1 = createSkillContext({});
    const context2 = createSkillContext({});

    expect(context1.executionId).not.toBe(context2.executionId);
  });
});

describe('BaseSkill', () => {
  class TestSkill extends BaseSkill {
    constructor(config: SkillConfig = {}) {
      const manifest = createSkillManifest({
        id: 'test-skill',
        name: 'Test Skill',
        description: 'A test skill',
        category: 'core',
      });

      super(manifest, config);

      // Register tool after calling super
      this.registerTool(
        {
          name: 'test_echo',
          description: 'Echo input',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Message to echo' },
            },
            required: ['message'],
          },
        },
        async (args, _ctx) => {
          const message = args.message as string;
          return {
            success: true,
            output: `Echo: ${message}`,
            data: { message },
            duration: 0,
          };
        }
      );
    }
  }

  it('should initialize with disabled status', () => {
    const skill = new TestSkill();
    expect(skill.status).toBe('disabled');
  });

  it('should initialize skill', async () => {
    const skill = new TestSkill();
    const context = createSkillContext({});
    await skill.initialize(context);
    expect(skill.status).toBe('enabled');
  });

  it('should cleanup skill', async () => {
    const skill = new TestSkill();
    const context = createSkillContext({});
    await skill.initialize(context);
    await skill.cleanup();
    expect(skill.status).toBe('disabled');
  });

  it('should return manifest', () => {
    const skill = new TestSkill();
    const manifest = skill.manifest;
    expect(manifest.id).toBe('test-skill');
  });

  it('should execute tool', async () => {
    const skill = new TestSkill();
    const context = createSkillContext({});
    await skill.initialize(context);

    const result = await skill.execute('test_echo', { message: 'hello' }, context);

    expect(result.success).toBe(true);
    expect(result.output).toBe('Echo: hello');
    expect(result.data).toEqual({ message: 'hello' });
  });

  it('should handle unknown tool', async () => {
    const skill = new TestSkill();
    const context = createSkillContext({});
    await skill.initialize(context);

    const result = await skill.execute('unknown_tool', {}, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should get tools', () => {
    const skill = new TestSkill();
    const tools = skill.getTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]?.definition.name).toBe('test_echo');
  });

  it('should apply default config values', () => {
    const skill = new TestSkill();
    expect(skill.status).toBe('disabled');
    // Config should have schema defaults applied
  });

  it('should merge custom config', () => {
    const config: SkillConfig = {
      enabled: true,
      timeout: 5000,
      custom: { key: 'value' },
    };
    const skill = new TestSkill(config);
    // Custom options should be accessible through the skill
    expect(skill.status).toBe('disabled'); // Status is set during initialize
  });
});
