/**
 * Configuration type definitions
 */

import { z } from 'zod';

/**
 * Gateway configuration schema
 */
export const GatewayConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(18789),
  bind: z.string().default('127.0.0.1'),
  enableAuth: z.boolean().default(true),
  authToken: z.string().optional(),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

/**
 * Model provider configuration
 */
export const ModelConfigSchema = z.object({
  primary: z.string().default('anthropic/claude-sonnet-4'),
  fallback: z.array(z.string()).default([]),
  reasoning: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('medium'),
  maxTokens: z.number().int().positive().default(8192),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * Channel configuration (base)
 */
export const BaseChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  allowlist: z.array(z.string()).default([]),
  blocklist: z.array(z.string()).default([]),
});

/**
 * Telegram channel configuration
 */
export const TelegramConfigSchema = BaseChannelConfigSchema.extend({
  token: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  allowDirectMessages: z.boolean().default(true),
  allowGroupMessages: z.boolean().default(false),
  requireMention: z.boolean().default(true),
});

export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

/**
 * Slack channel configuration
 */
export const SlackConfigSchema = BaseChannelConfigSchema.extend({
  botToken: z.string().optional(),
  appToken: z.string().optional(),
  signingSecret: z.string().optional(),
});

export type SlackConfig = z.infer<typeof SlackConfigSchema>;

/**
 * Discord channel configuration
 */
export const DiscordConfigSchema = BaseChannelConfigSchema.extend({
  token: z.string().optional(),
  applicationId: z.string().optional(),
  allowDirectMessages: z.boolean().default(true),
  allowServerMessages: z.boolean().default(false),
  requireMention: z.boolean().default(true),
});

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

/**
 * WhatsApp channel configuration
 */
export const WhatsAppConfigSchema = BaseChannelConfigSchema.extend({
  sessionPath: z.string().optional(),
});

export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

/**
 * Signal channel configuration
 */
export const SignalConfigSchema = BaseChannelConfigSchema.extend({
  phoneNumber: z.string().optional(),
  configPath: z.string().optional(),
  signalCliPath: z.string().optional(),
  allowDirectMessages: z.boolean().default(true),
  allowGroupMessages: z.boolean().default(false),
});

export type SignalConfig = z.infer<typeof SignalConfigSchema>;

/**
 * All channels configuration
 */
export const ChannelsConfigSchema = z.object({
  telegram: TelegramConfigSchema.default({}),
  slack: SlackConfigSchema.default({}),
  discord: DiscordConfigSchema.default({}),
  whatsapp: WhatsAppConfigSchema.default({}),
  signal: SignalConfigSchema.default({}),
});

export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;

/**
 * Ralph loop configuration
 */
export const RalphConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(10),
  qualityGates: z.object({
    tests: z.boolean().default(true),
    typecheck: z.boolean().default(true),
    lint: z.boolean().default(false),
    browserVerify: z.boolean().default(false),
  }).default({}),
  autoArchive: z.boolean().default(true),
  autoPR: z.boolean().default(false),
  progressFile: z.string().default('progress.txt'),
  prdFile: z.string().default('prd.json'),
});

export type RalphConfig = z.infer<typeof RalphConfigSchema>;

/**
 * Browser automation configuration
 */
export const BrowserConfigSchema = z.object({
  browserType: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  mode: z.enum(['headless', 'headed']).default('headless'),
  executablePath: z.string().optional(),
  userDataDir: z.string().optional(),
  defaultTimeout: z.number().int().positive().default(30000),
  defaultNavigationTimeout: z.number().int().positive().default(60000),
  viewport: z.object({
    width: z.number().int().positive().default(1280),
    height: z.number().int().positive().default(720),
  }).default({}),
  slowMo: z.number().int().min(0).default(0),
  baselineDir: z.string().default('.clawdralph/baselines'),
  screenshotDir: z.string().default('.clawdralph/screenshots'),
});

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

/**
 * Dev server configuration
 */
export const DevServerConfigSchema = z.object({
  autoDetect: z.boolean().default(true),
  port: z.number().int().min(1).max(65535).optional(),
  host: z.string().default('localhost'),
  command: z.string().optional(),
  cwd: z.string().optional(),
  waitForReady: z.boolean().default(true),
  readyTimeout: z.number().int().positive().default(60000),
});

export type DevServerConfig = z.infer<typeof DevServerConfigSchema>;

/**
 * Workspace configuration
 */
export const WorkspaceConfigSchema = z.object({
  default: z.string().default('~/projects'),
  allowed: z.array(z.string()).default(['~/projects', '~/work']),
  sandbox: z.boolean().default(false),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/**
 * Logging configuration
 */
export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  file: z.string().optional(),
  maxSize: z.number().int().positive().default(10 * 1024 * 1024), // 10MB
  maxFiles: z.number().int().positive().default(5),
  json: z.boolean().default(false),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

/**
 * Memory system configuration
 */
export const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  databasePath: z.string().default('.clawdralph/memory.db'),
  embeddingProvider: z.enum(['openai', 'ollama', 'local']).default('openai'),
  embeddingModel: z.string().optional(),
  chunkSize: z.number().int().positive().default(1000),
  chunkOverlap: z.number().int().min(0).default(200),
  maxDocuments: z.number().int().positive().default(100000),
  cacheEmbeddings: z.boolean().default(true),
  autoIndex: z.boolean().default(true),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

/**
 * Skills system configuration
 */
export const SkillsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  enableCore: z.boolean().default(true),
  enableIntegrations: z.boolean().default(true),
  sandbox: z.boolean().default(false),
  customSkillsDir: z.string().optional(),
  disabledSkills: z.array(z.string()).default([]),
});

export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

/**
 * Complete application configuration
 */
export const AppConfigSchema = z.object({
  gateway: GatewayConfigSchema.default({}),
  models: ModelConfigSchema.default({}),
  channels: ChannelsConfigSchema.default({}),
  ralph: RalphConfigSchema.default({}),
  browser: BrowserConfigSchema.default({}),
  devServer: DevServerConfigSchema.default({}),
  memory: MemoryConfigSchema.default({}),
  skills: SkillsConfigSchema.default({}),
  workspace: WorkspaceConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Configuration file metadata
 */
export interface ConfigMetadata {
  path: string;
  lastLoaded: Date;
  isDefault: boolean;
}
