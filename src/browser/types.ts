/**
 * Browser automation type definitions
 * Phase 6: Browser Automation & Verification
 */

import { z } from 'zod';

/**
 * Supported browser types
 */
export type BrowserType = 'chromium' | 'firefox' | 'webkit';

/**
 * Browser launch mode
 */
export type BrowserMode = 'headless' | 'headed';

/**
 * Browser instance state
 */
export type BrowserState = 'idle' | 'launching' | 'running' | 'closing' | 'closed' | 'error';

/**
 * Page load state
 */
export type PageLoadState = 'domcontentloaded' | 'load' | 'networkidle';

/**
 * Element selector strategy
 */
export type SelectorStrategy = 'css' | 'xpath' | 'text' | 'role' | 'testid';

/**
 * Screenshot format
 */
export type ScreenshotFormat = 'png' | 'jpeg';

/**
 * Browser configuration schema
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
  proxy: z.object({
    server: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
  }).optional(),
  extraArgs: z.array(z.string()).default([]),
  ignoreHTTPSErrors: z.boolean().default(false),
  slowMo: z.number().int().min(0).default(0),
});

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

/**
 * Screenshot options schema
 */
export const ScreenshotOptionsSchema = z.object({
  path: z.string().optional(),
  type: z.enum(['png', 'jpeg']).default('png'),
  quality: z.number().int().min(0).max(100).optional(),
  fullPage: z.boolean().default(false),
  clip: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  omitBackground: z.boolean().default(false),
});

export type ScreenshotOptions = z.infer<typeof ScreenshotOptionsSchema>;

/**
 * Element locator options
 */
export const LocatorOptionsSchema = z.object({
  selector: z.string(),
  strategy: z.enum(['css', 'xpath', 'text', 'role', 'testid']).default('css'),
  timeout: z.number().int().positive().optional(),
  visible: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export type LocatorOptions = z.infer<typeof LocatorOptionsSchema>;

/**
 * Navigation options
 */
export const NavigationOptionsSchema = z.object({
  url: z.string().url(),
  waitUntil: z.enum(['domcontentloaded', 'load', 'networkidle']).default('load'),
  timeout: z.number().int().positive().optional(),
  referer: z.string().optional(),
});

export type NavigationOptions = z.infer<typeof NavigationOptionsSchema>;

/**
 * Click options
 */
export const ClickOptionsSchema = z.object({
  button: z.enum(['left', 'right', 'middle']).default('left'),
  clickCount: z.number().int().positive().default(1),
  delay: z.number().int().min(0).default(0),
  force: z.boolean().default(false),
  modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).default([]),
});

export type ClickOptions = z.infer<typeof ClickOptionsSchema>;

/**
 * Type/fill options
 */
export const TypeOptionsSchema = z.object({
  text: z.string(),
  delay: z.number().int().min(0).default(0),
  clear: z.boolean().default(false),
});

export type TypeOptions = z.infer<typeof TypeOptionsSchema>;

/**
 * Browser instance info
 */
export interface BrowserInstance {
  id: string;
  type: BrowserType;
  mode: BrowserMode;
  state: BrowserState;
  pid?: number;
  wsEndpoint?: string;
  createdAt: Date;
  lastActivityAt: Date;
  pageCount: number;
}

/**
 * Page snapshot for agent context
 */
export interface PageSnapshot {
  url: string;
  title: string;
  html?: string;
  text?: string;
  screenshot?: string; // Base64 encoded
  timestamp: Date;
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Element info from DOM
 */
export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  attributes: Record<string, string>;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isVisible: boolean;
  isEnabled: boolean;
  isEditable: boolean;
}

/**
 * UI verification result
 */
export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
  screenshot?: string;
  duration: number;
  timestamp: Date;
}

/**
 * Single verification check
 */
export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

/**
 * Visual diff result
 */
export interface VisualDiffResult {
  match: boolean;
  diffPercentage: number;
  diffPixels: number;
  baselineImage?: string;
  currentImage?: string;
  diffImage?: string;
}

/**
 * Dev server info
 */
export interface DevServerInfo {
  type: DevServerType;
  port: number;
  host: string;
  url: string;
  status: 'running' | 'stopped' | 'starting' | 'error';
  pid?: number;
  command?: string;
}

/**
 * Detected dev server types
 */
export type DevServerType =
  | 'vite'
  | 'webpack'
  | 'next'
  | 'remix'
  | 'astro'
  | 'create-react-app'
  | 'parcel'
  | 'esbuild'
  | 'custom'
  | 'unknown';

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
  readyPattern: z.string().optional(),
});

export type DevServerConfig = z.infer<typeof DevServerConfigSchema>;

/**
 * Browser action for agent tool
 */
export type BrowserAction =
  | { type: 'navigate'; url: string; waitUntil?: PageLoadState }
  | { type: 'click'; selector: string; options?: ClickOptions }
  | { type: 'type'; selector: string; text: string; options?: Partial<TypeOptions> }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'select'; selector: string; values: string[] }
  | { type: 'check'; selector: string }
  | { type: 'uncheck'; selector: string }
  | { type: 'hover'; selector: string }
  | { type: 'scroll'; selector?: string; x?: number; y?: number }
  | { type: 'screenshot'; options?: Partial<ScreenshotOptions> }
  | { type: 'wait'; selector?: string; timeout?: number; state?: 'visible' | 'hidden' | 'attached' | 'detached' }
  | { type: 'evaluate'; script: string }
  | { type: 'press'; key: string }
  | { type: 'upload'; selector: string; files: string[] }
  | { type: 'close' };

/**
 * Browser action result
 */
export interface BrowserActionResult {
  success: boolean;
  action: BrowserAction;
  data?: unknown;
  screenshot?: string;
  error?: string;
  duration: number;
}

/**
 * Browser session for persistent browsing
 */
export interface BrowserSession {
  id: string;
  browserId: string;
  createdAt: Date;
  lastActivityAt: Date;
  url: string;
  title: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}
