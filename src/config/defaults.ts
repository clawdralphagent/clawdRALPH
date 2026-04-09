/**
 * Default configuration values
 */

import type { AppConfig } from '../types/config.js';

/**
 * Deep partial type for nested optional properties
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Get default configuration
 */
export function getDefaultConfig(): AppConfig {
  return {
    gateway: {
      port: 18789,
      bind: '127.0.0.1',
      enableAuth: true,
      authToken: undefined,
    },
    models: {
      primary: 'anthropic/claude-sonnet-4',
      fallback: [],
      reasoning: 'medium',
      maxTokens: 8192,
      temperature: 0.7,
    },
    channels: {
      telegram: {
        enabled: false,
        allowlist: [],
        blocklist: [],
        token: undefined,
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
      maxSize: 10 * 1024 * 1024,
      maxFiles: 5,
      json: false,
    },
  };
}

/**
 * Get minimal example configuration for documentation
 */
export function getExampleConfig(): DeepPartial<AppConfig> {
  return {
    gateway: {
      port: 18789,
      bind: '127.0.0.1',
      enableAuth: true,
    },
    models: {
      primary: 'anthropic/claude-sonnet-4',
      reasoning: 'medium',
    },
    channels: {
      telegram: {
        enabled: true,
        token: '${TELEGRAM_BOT_TOKEN}',
        allowlist: ['@your_username'],
      },
    },
    ralph: {
      maxIterations: 10,
      qualityGates: {
        tests: true,
        typecheck: true,
      },
    },
    workspace: {
      default: '~/projects',
    },
    logging: {
      level: 'info',
    },
  };
}
