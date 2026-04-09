/**
 * Skill System Type Definitions
 * Defines skill interfaces, manifests, and execution types
 */

import { z } from 'zod';
import type { ToolDefinition } from '../ai/types.js';

/**
 * Skill categories
 */
export const SkillCategory = {
  CORE: 'core',
  FILESYSTEM: 'filesystem',
  GIT: 'git',
  SHELL: 'shell',
  HTTP: 'http',
  INTEGRATION: 'integration',
  CUSTOM: 'custom',
} as const;

export type SkillCategoryValue = typeof SkillCategory[keyof typeof SkillCategory];

/**
 * Skill status
 */
export const SkillStatus = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  ERROR: 'error',
  LOADING: 'loading',
} as const;

export type SkillStatusValue = typeof SkillStatus[keyof typeof SkillStatus];

/**
 * Skill permission levels
 */
export const SkillPermission = {
  READ: 'read',
  WRITE: 'write',
  EXECUTE: 'execute',
  NETWORK: 'network',
  SYSTEM: 'system',
} as const;

export type SkillPermissionValue = typeof SkillPermission[keyof typeof SkillPermission];

/**
 * Skill configuration schema
 */
export const SkillConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.number().int().positive().default(30000),
  retries: z.number().int().min(0).default(0),
  rateLimit: z.object({
    maxRequests: z.number().int().positive().optional(),
    windowMs: z.number().int().positive().optional(),
  }).optional(),
  custom: z.record(z.unknown()).default({}),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

/**
 * Skill manifest schema
 */
export const SkillManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().default('1.0.0'),
  author: z.string().optional(),
  category: z.enum(['core', 'filesystem', 'git', 'shell', 'http', 'integration', 'custom']),
  permissions: z.array(z.enum(['read', 'write', 'execute', 'network', 'system'])).default([]),
  dependencies: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  config: SkillConfigSchema.default({}),
  tags: z.array(z.string()).default([]),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

/**
 * Skill execution context
 */
export interface SkillContext {
  /** Unique execution ID */
  executionId: string;

  /** Conversation/session ID */
  sessionId?: string;

  /** User ID */
  userId?: string;

  /** Working directory */
  workingDir: string;

  /** Environment variables */
  env: Record<string, string>;

  /** Metadata */
  metadata: Record<string, unknown>;

  /** Timeout in milliseconds */
  timeout: number;

  /** Abort signal */
  signal?: AbortSignal;
}

/**
 * Skill execution result
 */
export interface SkillResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
  duration: number;
}

/**
 * Skill handler function type
 */
export type SkillHandler = (
  args: Record<string, unknown>,
  context: SkillContext
) => Promise<SkillResult>;

/**
 * Skill tool definition with handler
 */
export interface SkillTool {
  definition: ToolDefinition;
  handler: SkillHandler;
}

/**
 * Skill interface
 */
export interface Skill {
  /** Skill manifest */
  readonly manifest: SkillManifest;

  /** Current status */
  status: SkillStatusValue;

  /** Error message if status is 'error' */
  error?: string;

  /** Initialize the skill */
  initialize(context: SkillContext): Promise<void>;

  /** Cleanup the skill */
  cleanup(): Promise<void>;

  /** Get all tools provided by this skill */
  getTools(): SkillTool[];

  /** Execute a specific tool */
  execute(toolName: string, args: Record<string, unknown>, context: SkillContext): Promise<SkillResult>;
}

/**
 * Skill factory function type
 */
export type SkillFactory = (config?: SkillConfig) => Skill;

/**
 * Registered skill info
 */
export interface RegisteredSkill {
  manifest: SkillManifest;
  factory: SkillFactory;
  instance?: Skill;
}

/**
 * Skill registry interface
 */
export interface SkillRegistry {
  /** Register a skill factory */
  register(manifest: SkillManifest, factory: SkillFactory): void;

  /** Unregister a skill */
  unregister(skillId: string): void;

  /** Get a skill by ID */
  get(skillId: string): Skill | undefined;

  /** Get all registered skills */
  list(): RegisteredSkill[];

  /** Enable a skill */
  enable(skillId: string, config?: SkillConfig): Promise<void>;

  /** Disable a skill */
  disable(skillId: string): Promise<void>;

  /** Get all tools from enabled skills */
  getTools(): SkillTool[];

  /** Execute a tool */
  execute(toolName: string, args: Record<string, unknown>, context: SkillContext): Promise<SkillResult>;
}

/**
 * Skill discovery interface
 */
export interface SkillDiscovery {
  /** Discover skills from a directory */
  discoverFromDirectory(dirPath: string): Promise<RegisteredSkill[]>;

  /** Discover skills from npm packages */
  discoverFromPackages(packages: string[]): Promise<RegisteredSkill[]>;

  /** Load a skill from a manifest file */
  loadFromManifest(manifestPath: string): Promise<RegisteredSkill>;
}

/**
 * Skill sandbox options
 */
export interface SandboxOptions {
  /** Enable file system access */
  filesystem?: {
    allowRead?: string[];
    allowWrite?: string[];
    denyPaths?: string[];
  };

  /** Enable network access */
  network?: {
    allowHosts?: string[];
    denyHosts?: string[];
    maxRequestsPerMinute?: number;
  };

  /** Enable process execution */
  process?: {
    allowCommands?: string[];
    denyCommands?: string[];
    maxConcurrent?: number;
  };

  /** Resource limits */
  limits?: {
    maxMemoryMb?: number;
    maxCpuPercent?: number;
    maxExecutionMs?: number;
  };
}

/**
 * Skill event types
 */
export interface SkillExecutionStartedEvent {
  skillId: string;
  toolName: string;
  executionId: string;
  timestamp: string;
}

export interface SkillExecutionCompletedEvent {
  skillId: string;
  toolName: string;
  executionId: string;
  success: boolean;
  duration: number;
  timestamp: string;
}

export interface SkillStatusChangedEvent {
  skillId: string;
  previousStatus: SkillStatusValue;
  newStatus: SkillStatusValue;
  error?: string;
  timestamp: string;
}

/**
 * Base skill implementation
 */
export abstract class BaseSkill implements Skill {
  readonly manifest: SkillManifest;
  status: SkillStatusValue = 'disabled';
  error?: string;

  protected tools: Map<string, SkillTool> = new Map();
  protected config: SkillConfig;

  constructor(manifest: SkillManifest, config?: SkillConfig) {
    this.manifest = manifest;
    this.config = { ...SkillConfigSchema.parse({}), ...config };
  }

  async initialize(_context: SkillContext): Promise<void> {
    this.status = 'enabled';
    this.error = undefined;
  }

  async cleanup(): Promise<void> {
    this.status = 'disabled';
  }

  getTools(): SkillTool[] {
    return Array.from(this.tools.values());
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        success: false,
        output: `Tool not found: ${toolName}`,
        error: `Tool "${toolName}" not found in skill "${this.manifest.id}"`,
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const result = await tool.handler(args, context);
      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Register a tool
   */
  protected registerTool(definition: ToolDefinition, handler: SkillHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }
}

/**
 * Helper to create a skill manifest
 */
export function createSkillManifest(data: {
  id: string;
  name: string;
  description: string;
  category: SkillCategoryValue;
  permissions?: SkillPermissionValue[];
  dependencies?: string[];
  tags?: string[];
  version?: string;
  author?: string;
}): SkillManifest {
  return SkillManifestSchema.parse({
    id: data.id,
    name: data.name,
    description: data.description,
    category: data.category,
    permissions: data.permissions ?? [],
    dependencies: data.dependencies ?? [],
    tags: data.tags ?? [],
    version: data.version ?? '1.0.0',
    author: data.author,
  });
}

/**
 * Helper to create skill context
 */
export function createSkillContext(data: {
  workingDir?: string;
  sessionId?: string;
  userId?: string;
  env?: Record<string, string>;
  timeout?: number;
}): SkillContext {
  return {
    executionId: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    workingDir: data.workingDir ?? process.cwd(),
    sessionId: data.sessionId,
    userId: data.userId,
    env: data.env ?? {},
    metadata: {},
    timeout: data.timeout ?? 30000,
  };
}
