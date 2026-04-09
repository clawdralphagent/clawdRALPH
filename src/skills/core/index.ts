/**
 * Core Skills Module
 * Exports all built-in core skills
 */

export * from './filesystem.js';
export * from './git.js';
export * from './shell.js';
export * from './http.js';

import { createFilesystemSkill } from './filesystem.js';
import { createGitSkill } from './git.js';
import { createShellSkill } from './shell.js';
import { createHttpSkill } from './http.js';
import type { SkillConfig, SkillFactory, SkillManifest } from '../types.js';

/**
 * All core skill factories
 */
export const coreSkillFactories: Record<string, SkillFactory> = {
  filesystem: createFilesystemSkill,
  git: createGitSkill,
  shell: createShellSkill,
  http: createHttpSkill,
};

/**
 * Get all core skill manifests
 */
export function getCoreSkillManifests(): SkillManifest[] {
  return [
    createFilesystemSkill().manifest,
    createGitSkill().manifest,
    createShellSkill().manifest,
    createHttpSkill().manifest,
  ];
}

/**
 * Register all core skills with a registry
 */
export function registerCoreSkills(
  register: (manifest: SkillManifest, factory: SkillFactory) => void,
  config?: Partial<Record<string, SkillConfig>>
): void {
  for (const [id, factory] of Object.entries(coreSkillFactories)) {
    const skill = factory(config?.[id]);
    register(skill.manifest, () => factory(config?.[id]));
  }
}
