/**
 * Test fixtures
 */

import type { AppConfig } from '../types/config.js';

/**
 * Sample valid configuration
 */
export const validConfig: AppConfig = {
  gateway: {
    port: 18789,
    bind: '127.0.0.1',
    enableAuth: true,
    authToken: 'test-token',
  },
  models: {
    primary: 'anthropic/claude-sonnet-4',
    fallback: ['openai/gpt-4-turbo'],
    reasoning: 'medium',
    maxTokens: 8192,
    temperature: 0.7,
  },
  channels: {
    telegram: {
      enabled: true,
      allowlist: ['@testuser'],
      blocklist: [],
      token: 'telegram-token',
      webhookUrl: undefined,
      allowDirectMessages: true,
      allowGroupMessages: false,
      requireMention: true,
    },
    slack: {
      enabled: false,
      allowlist: [],
      blocklist: [],
      botToken: undefined,
      appToken: undefined,
      signingSecret: undefined,
    },
    discord: {
      enabled: false,
      allowlist: [],
      blocklist: [],
      token: undefined,
      applicationId: undefined,
      allowDirectMessages: true,
      allowServerMessages: false,
      requireMention: true,
    },
    whatsapp: {
      enabled: false,
      allowlist: [],
      blocklist: [],
      sessionPath: undefined,
    },
    signal: {
      enabled: false,
      allowlist: [],
      blocklist: [],
      phoneNumber: undefined,
      configPath: undefined,
      signalCliPath: undefined,
      allowDirectMessages: true,
      allowGroupMessages: false,
    },
  },
  ralph: {
    maxIterations: 10,
    qualityGates: {
      tests: true,
      typecheck: true,
      lint: false,
      browserVerify: false,
    },
    autoArchive: true,
    autoPR: false,
    progressFile: 'progress.txt',
    prdFile: 'prd.json',
  },
  browser: {
    browserType: 'chromium',
    mode: 'headless',
    executablePath: undefined,
    userDataDir: undefined,
    defaultTimeout: 30000,
    defaultNavigationTimeout: 60000,
    viewport: {
      width: 1280,
      height: 720,
    },
    slowMo: 0,
    baselineDir: '.clawdralph/baselines',
    screenshotDir: '.clawdralph/screenshots',
  },
  devServer: {
    autoDetect: true,
    port: undefined,
    host: 'localhost',
    command: undefined,
    cwd: undefined,
    waitForReady: true,
    readyTimeout: 60000,
  },
  memory: {
    enabled: true,
    databasePath: '.clawdralph/memory.db',
    embeddingProvider: 'openai',
    embeddingModel: undefined,
    chunkSize: 1000,
    chunkOverlap: 200,
    maxDocuments: 100000,
    cacheEmbeddings: true,
    autoIndex: true,
  },
  skills: {
    enabled: true,
    enableCore: true,
    enableIntegrations: true,
    sandbox: false,
    customSkillsDir: undefined,
    disabledSkills: [],
  },
  workspace: {
    default: '~/projects',
    allowed: ['~/projects', '~/work'],
    sandbox: false,
  },
  logging: {
    level: 'info',
    file: undefined,
    maxSize: 10485760,
    maxFiles: 5,
    json: false,
  },
};

/**
 * Minimal valid configuration
 */
export const minimalConfig = {
  gateway: {
    port: 8080,
  },
  models: {
    primary: 'anthropic/claude-sonnet-4',
  },
};

/**
 * Invalid configuration (for testing validation)
 */
export const invalidConfig = {
  gateway: {
    port: -1, // Invalid: negative port
    bind: 123, // Invalid: should be string
  },
  models: {
    reasoning: 'invalid-level', // Invalid: not in enum
  },
};

/**
 * Sample PRD JSON
 */
export const samplePRD = {
  project: 'TestApp',
  branchName: 'ralph/test-feature',
  description: 'A test feature for unit testing',
  userStories: [
    {
      id: 'US-001',
      title: 'Add login button',
      description: 'As a user, I want to see a login button on the homepage',
      acceptanceCriteria: ['Button is visible on homepage', 'Button says "Login"'],
      priority: 1,
      passes: false,
      notes: '',
    },
    {
      id: 'US-002',
      title: 'Login form modal',
      description: 'As a user, I want to see a login form when I click the button',
      acceptanceCriteria: ['Modal opens on click', 'Form has email and password fields'],
      priority: 2,
      passes: false,
      notes: '',
    },
  ],
};

/**
 * Sample progress.txt content
 */
export const sampleProgressContent = `# Progress Log

## Iteration 1 - 2026-01-26T10:00:00Z
- Story: US-001 (Add login button)
- Status: Completed
- Files changed: src/components/Header.tsx
- Learnings: Used existing Button component from design system

## Iteration 2 - 2026-01-26T10:30:00Z
- Story: US-002 (Login form modal)
- Status: In Progress
- Files changed: src/components/LoginModal.tsx
- Notes: Need to add form validation
`;
