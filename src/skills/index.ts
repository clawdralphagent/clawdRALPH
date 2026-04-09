/**
 * Skills Module
 * Main export for the skill system
 */

export * from './types.js';
export * from './registry.js';
export * from './core/index.js';
export * from './integrations/index.js';

import { createLogger } from '../logging/logger.js';
import {
  DefaultSkillRegistry,
  DefaultSkillDiscovery,
} from './registry.js';
import { registerCoreSkills, coreSkillFactories } from './core/index.js';
import { registerIntegrationSkills, integrationSkillFactories } from './integrations/index.js';
import type { SkillConfig, SkillContext, SkillTool, SkillManifest } from './types.js';
import { createSkillContext } from './types.js';

const log = createLogger('skills');

/**
 * Skills System - Main facade for the skills module
 */
export class SkillsSystem {
  private registry: DefaultSkillRegistry;
  private discovery: DefaultSkillDiscovery;
  private defaultContext: Partial<SkillContext>;
  private initialized: boolean = false;

  constructor(options?: {
    workingDir?: string;
    sandbox?: boolean;
  }) {
    this.defaultContext = {
      workingDir: options?.workingDir ?? process.cwd(),
    };

    this.registry = new DefaultSkillRegistry(this.defaultContext);
    this.discovery = new DefaultSkillDiscovery();
    // Note: sandbox and rate limiting can be added in future iterations
  }

  /**
   * Initialize the skills system with default skills
   */
  async initialize(options?: {
    enableCore?: boolean;
    enableIntegrations?: boolean;
    skillConfig?: Partial<Record<string, SkillConfig>>;
  }): Promise<void> {
    if (this.initialized) return;

    const opts = {
      enableCore: true,
      enableIntegrations: true,
      ...options,
    };

    log.info('Initializing skills system');

    // Register core skills
    if (opts.enableCore) {
      registerCoreSkills(
        (manifest, factory) => this.registry.register(manifest, factory),
        opts.skillConfig
      );
      log.info('Core skills registered', { count: Object.keys(coreSkillFactories).length });
    }

    // Register integration skills
    if (opts.enableIntegrations) {
      registerIntegrationSkills(
        (manifest, factory) => this.registry.register(manifest, factory),
        opts.skillConfig
      );
      log.info('Integration skills registered', { count: Object.keys(integrationSkillFactories).length });
    }

    this.initialized = true;
    log.info('Skills system initialized');
  }

  /**
   * Enable a skill by ID
   */
  async enableSkill(skillId: string, config?: SkillConfig): Promise<void> {
    await this.registry.enable(skillId, config);
  }

  /**
   * Disable a skill by ID
   */
  async disableSkill(skillId: string): Promise<void> {
    await this.registry.disable(skillId);
  }

  /**
   * Get all registered skills
   */
  listSkills(): Array<{ id: string; name: string; enabled: boolean; category: string }> {
    return this.registry.list().map((s) => ({
      id: s.manifest.id,
      name: s.manifest.name,
      enabled: s.instance?.status === 'enabled',
      category: s.manifest.category,
    }));
  }

  /**
   * Get all tools from enabled skills
   */
  getTools(): SkillTool[] {
    return this.registry.getTools();
  }

  /**
   * Execute a tool
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    contextOverrides?: Partial<SkillContext>
  ): Promise<{ success: boolean; output: string; data?: unknown; error?: string }> {
    const context = createSkillContext({
      ...this.defaultContext,
      ...contextOverrides,
    });

    const result = await this.registry.execute(toolName, args, context);

    return {
      success: result.success,
      output: result.output,
      data: result.data,
      error: result.error,
    };
  }

  /**
   * Get skill statistics
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    error: number;
    tools: number;
  } {
    return this.registry.getStats();
  }

  /**
   * Discover skills from a directory
   */
  async discoverSkills(dirPath: string): Promise<SkillManifest[]> {
    const discovered = await this.discovery.discoverFromDirectory(dirPath);

    for (const skill of discovered) {
      this.registry.register(skill.manifest, skill.factory);
    }

    return discovered.map((s) => s.manifest);
  }

  /**
   * Get the registry for advanced usage
   */
  getRegistry(): DefaultSkillRegistry {
    return this.registry;
  }
}

/**
 * Create a skills system with default configuration
 */
export function createSkillsSystem(options?: {
  workingDir?: string;
  sandbox?: boolean;
}): SkillsSystem {
  return new SkillsSystem(options);
}

/**
 * Create skill tools for agent integration
 */
export function createSkillTools(skillsSystem: SkillsSystem) {
  return [
    {
      definition: {
        name: 'skill_list',
        description: 'List all available skills',
        parameters: {
          type: 'object' as const,
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category',
            },
            enabledOnly: {
              type: 'boolean',
              description: 'Only show enabled skills',
            },
          },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const category = args.category as string | undefined;
        const enabledOnly = args.enabledOnly as boolean ?? false;

        let skills = skillsSystem.listSkills();

        if (category) {
          skills = skills.filter((s) => s.category === category);
        }

        if (enabledOnly) {
          skills = skills.filter((s) => s.enabled);
        }

        const output = skills
          .map((s) => `${s.enabled ? '✓' : '○'} ${s.id} (${s.category}): ${s.name}`)
          .join('\n');

        return {
          success: true,
          content: output || 'No skills found',
          data: skills,
        };
      },
    },
    {
      definition: {
        name: 'skill_enable',
        description: 'Enable a skill',
        parameters: {
          type: 'object' as const,
          properties: {
            skillId: {
              type: 'string',
              description: 'The skill ID to enable',
            },
          },
          required: ['skillId'],
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const skillId = args.skillId as string;

        try {
          await skillsSystem.enableSkill(skillId);
          return {
            success: true,
            content: `Skill "${skillId}" enabled`,
          };
        } catch (error) {
          return {
            success: false,
            content: `Failed to enable skill: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      definition: {
        name: 'skill_disable',
        description: 'Disable a skill',
        parameters: {
          type: 'object' as const,
          properties: {
            skillId: {
              type: 'string',
              description: 'The skill ID to disable',
            },
          },
          required: ['skillId'],
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const skillId = args.skillId as string;

        try {
          await skillsSystem.disableSkill(skillId);
          return {
            success: true,
            content: `Skill "${skillId}" disabled`,
          };
        } catch (error) {
          return {
            success: false,
            content: `Failed to disable skill: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}
