/**
 * Skill Registry
 * Manages skill registration, discovery, and execution
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logging/logger.js';
import type {
  SkillRegistry,
  SkillDiscovery,
  Skill,
  SkillManifest,
  SkillFactory,
  SkillConfig,
  SkillContext,
  SkillResult,
  SkillTool,
  RegisteredSkill,
  SandboxOptions,
} from './types.js';
import { SkillManifestSchema, createSkillContext } from './types.js';

const log = createLogger('skill-registry');

/**
 * Default Skill Registry Implementation
 */
export class DefaultSkillRegistry implements SkillRegistry {
  private skills: Map<string, RegisteredSkill> = new Map();
  private toolToSkill: Map<string, string> = new Map();
  private defaultContext: Partial<SkillContext>;

  constructor(defaultContext?: Partial<SkillContext>) {
    this.defaultContext = defaultContext ?? {};
  }

  /**
   * Register a skill factory
   */
  register(manifest: SkillManifest, factory: SkillFactory): void {
    if (this.skills.has(manifest.id)) {
      log.warn('Overwriting existing skill', { id: manifest.id });
    }

    this.skills.set(manifest.id, {
      manifest,
      factory,
    });

    log.info('Skill registered', { id: manifest.id, name: manifest.name });
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): void {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    // Remove tool mappings
    if (skill.instance) {
      for (const tool of skill.instance.getTools()) {
        this.toolToSkill.delete(tool.definition.name);
      }
    }

    this.skills.delete(skillId);
    log.info('Skill unregistered', { id: skillId });
  }

  /**
   * Get a skill by ID
   */
  get(skillId: string): Skill | undefined {
    const registered = this.skills.get(skillId);
    return registered?.instance;
  }

  /**
   * List all registered skills
   */
  list(): RegisteredSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Enable a skill
   */
  async enable(skillId: string, config?: SkillConfig): Promise<void> {
    const registered = this.skills.get(skillId);

    if (!registered) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Create instance if not exists
    if (!registered.instance) {
      registered.instance = registered.factory(config);
    }

    // Initialize
    const context = createSkillContext({
      ...this.defaultContext,
    });

    try {
      await registered.instance.initialize(context);

      // Register tool mappings
      for (const tool of registered.instance.getTools()) {
        this.toolToSkill.set(tool.definition.name, skillId);
      }

      log.info('Skill enabled', { id: skillId });
    } catch (error) {
      registered.instance.status = 'error';
      registered.instance.error = error instanceof Error ? error.message : String(error);
      log.error('Failed to enable skill', { id: skillId, error });
      throw error;
    }
  }

  /**
   * Disable a skill
   */
  async disable(skillId: string): Promise<void> {
    const registered = this.skills.get(skillId);

    if (!registered?.instance) {
      return;
    }

    // Remove tool mappings
    for (const tool of registered.instance.getTools()) {
      this.toolToSkill.delete(tool.definition.name);
    }

    await registered.instance.cleanup();
    log.info('Skill disabled', { id: skillId });
  }

  /**
   * Get all tools from enabled skills
   */
  getTools(): SkillTool[] {
    const tools: SkillTool[] = [];

    for (const registered of this.skills.values()) {
      if (registered.instance?.status === 'enabled') {
        tools.push(...registered.instance.getTools());
      }
    }

    return tools;
  }

  /**
   * Execute a tool
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const skillId = this.toolToSkill.get(toolName);

    if (!skillId) {
      return {
        success: false,
        output: `Tool not found: ${toolName}`,
        error: `No skill provides tool "${toolName}"`,
        duration: 0,
      };
    }

    const registered = this.skills.get(skillId);

    if (!registered?.instance || registered.instance.status !== 'enabled') {
      return {
        success: false,
        output: `Skill not enabled: ${skillId}`,
        error: `Skill "${skillId}" is not enabled`,
        duration: 0,
      };
    }

    return registered.instance.execute(toolName, args, context);
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
    let enabled = 0;
    let disabled = 0;
    let error = 0;

    for (const registered of this.skills.values()) {
      if (!registered.instance) {
        disabled++;
      } else {
        switch (registered.instance.status) {
          case 'enabled':
            enabled++;
            break;
          case 'error':
            error++;
            break;
          default:
            disabled++;
        }
      }
    }

    return {
      total: this.skills.size,
      enabled,
      disabled,
      error,
      tools: this.toolToSkill.size,
    };
  }
}

/**
 * Skill Discovery Implementation
 */
export class DefaultSkillDiscovery implements SkillDiscovery {
  /**
   * Discover skills from a directory
   */
  async discoverFromDirectory(dirPath: string): Promise<RegisteredSkill[]> {
    const skills: RegisteredSkill[] = [];

    if (!fs.existsSync(dirPath)) {
      log.warn('Skill directory not found', { path: dirPath });
      return skills;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(dirPath, entry.name);
      const manifestPath = path.join(skillDir, 'manifest.json');

      if (fs.existsSync(manifestPath)) {
        try {
          const skill = await this.loadFromManifest(manifestPath);
          skills.push(skill);
        } catch (error) {
          log.error('Failed to load skill', { path: manifestPath, error });
        }
      }
    }

    log.info('Discovered skills from directory', { path: dirPath, count: skills.length });
    return skills;
  }

  /**
   * Discover skills from npm packages
   */
  async discoverFromPackages(packages: string[]): Promise<RegisteredSkill[]> {
    const skills: RegisteredSkill[] = [];

    for (const pkg of packages) {
      try {
        // Dynamic import of the package
        const module = await import(pkg);

        if (module.manifest && module.factory) {
          const manifest = SkillManifestSchema.parse(module.manifest);
          skills.push({
            manifest,
            factory: module.factory,
          });

          log.info('Discovered skill from package', { package: pkg, id: manifest.id });
        }
      } catch (error) {
        log.error('Failed to load skill from package', { package: pkg, error });
      }
    }

    return skills;
  }

  /**
   * Load a skill from a manifest file
   */
  async loadFromManifest(manifestPath: string): Promise<RegisteredSkill> {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifestData = JSON.parse(manifestContent);
    const manifest = SkillManifestSchema.parse(manifestData);

    // Look for entry point
    const skillDir = path.dirname(manifestPath);
    const entryPath = path.join(skillDir, 'index.js');

    if (!fs.existsSync(entryPath)) {
      throw new Error(`Skill entry point not found: ${entryPath}`);
    }

    const module = await import(`file://${entryPath}`);

    if (!module.factory) {
      throw new Error(`Skill factory not exported: ${manifestPath}`);
    }

    return {
      manifest,
      factory: module.factory,
    };
  }
}

/**
 * Skill Sandbox for secure execution
 */
export class SkillSandbox {
  private options: SandboxOptions;

  constructor(options: SandboxOptions = {}) {
    this.options = options;
  }

  /**
   * Check if a file path is allowed
   */
  isPathAllowed(filePath: string, operation: 'read' | 'write'): boolean {
    const normalizedPath = path.resolve(filePath);

    // Check deny list first
    if (this.options.filesystem?.denyPaths) {
      for (const denyPath of this.options.filesystem.denyPaths) {
        if (normalizedPath.startsWith(path.resolve(denyPath))) {
          return false;
        }
      }
    }

    // Check allow list
    const allowList = operation === 'read'
      ? this.options.filesystem?.allowRead
      : this.options.filesystem?.allowWrite;

    if (allowList && allowList.length > 0) {
      for (const allowPath of allowList) {
        if (normalizedPath.startsWith(path.resolve(allowPath))) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * Check if a host is allowed for network access
   */
  isHostAllowed(host: string): boolean {
    // Check deny list first
    if (this.options.network?.denyHosts?.includes(host)) {
      return false;
    }

    // Check allow list
    if (this.options.network?.allowHosts && this.options.network.allowHosts.length > 0) {
      return this.options.network.allowHosts.includes(host);
    }

    return true;
  }

  /**
   * Check if a command is allowed
   */
  isCommandAllowed(command: string): boolean {
    const baseCommand = command.split(/\s+/)[0] ?? '';

    // Check deny list first
    if (baseCommand && this.options.process?.denyCommands?.includes(baseCommand)) {
      return false;
    }

    // Check allow list
    if (this.options.process?.allowCommands && this.options.process.allowCommands.length > 0) {
      return baseCommand ? this.options.process.allowCommands.includes(baseCommand) : false;
    }

    return true;
  }

  /**
   * Create sandboxed context
   */
  createContext(baseContext: SkillContext): SkillContext {
    return {
      ...baseContext,
      metadata: {
        ...baseContext.metadata,
        sandboxed: true,
        sandboxOptions: this.options,
      },
    };
  }
}

/**
 * Rate limiter for skills
 */
export class SkillRateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Check if request is allowed
   */
  isAllowed(skillId: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const key = skillId;

    let timestamps = this.requests.get(key) ?? [];

    // Remove old timestamps
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
      return false;
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);

    return true;
  }

  /**
   * Get remaining requests
   */
  getRemaining(skillId: string, maxRequests: number, windowMs: number): number {
    const now = Date.now();
    const timestamps = this.requests.get(skillId) ?? [];
    const validTimestamps = timestamps.filter((t) => now - t < windowMs);

    return Math.max(0, maxRequests - validTimestamps.length);
  }

  /**
   * Clear rate limit for a skill
   */
  clear(skillId: string): void {
    this.requests.delete(skillId);
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.requests.clear();
  }
}

/**
 * Create a skill registry with discovery and sandbox support
 */
export function createSkillRegistry(options?: {
  defaultContext?: Partial<SkillContext>;
  sandbox?: SandboxOptions;
}): {
  registry: DefaultSkillRegistry;
  discovery: DefaultSkillDiscovery;
  sandbox: SkillSandbox;
  rateLimiter: SkillRateLimiter;
} {
  const registry = new DefaultSkillRegistry(options?.defaultContext);
  const discovery = new DefaultSkillDiscovery();
  const sandbox = new SkillSandbox(options?.sandbox);
  const rateLimiter = new SkillRateLimiter();

  return { registry, discovery, sandbox, rateLimiter };
}
