/**
 * Integration Skills Module
 * Exports all integration skills for third-party services
 */

export * from './github.js';

import { createGitHubSkill } from './github.js';
import type { SkillConfig, SkillFactory, SkillManifest } from '../types.js';

/**
 * All integration skill factories
 */
export const integrationSkillFactories: Record<string, SkillFactory> = {
  github: createGitHubSkill,
};

/**
 * Get all integration skill manifests
 */
export function getIntegrationSkillManifests(): SkillManifest[] {
  return [
    createGitHubSkill().manifest,
  ];
}

/**
 * Register all integration skills with a registry
 */
export function registerIntegrationSkills(
  register: (manifest: SkillManifest, factory: SkillFactory) => void,
  config?: Partial<Record<string, SkillConfig>>
): void {
  for (const [id, factory] of Object.entries(integrationSkillFactories)) {
    const skill = factory(config?.[id]);
    register(skill.manifest, () => factory(config?.[id]));
  }
}
