/**
 * Browser automation module
 * Phase 6: Browser Automation & Verification
 *
 * Provides browser control via Playwright/CDP for:
 * - Page navigation and interactions
 * - Screenshots and visual regression
 * - UI verification and assertions
 * - Dev server management
 * - Agent tools for browser automation
 */

// Types
export type {
  BrowserType,
  BrowserMode,
  BrowserState,
  PageLoadState,
  SelectorStrategy,
  ScreenshotFormat,
  BrowserConfig,
  ScreenshotOptions,
  LocatorOptions,
  NavigationOptions,
  ClickOptions,
  TypeOptions,
  BrowserInstance,
  PageSnapshot,
  ElementInfo,
  VerificationResult,
  VerificationCheck,
  VisualDiffResult,
  DevServerInfo,
  DevServerType,
  DevServerConfig,
  BrowserAction,
  BrowserActionResult,
  BrowserSession,
} from './types.js';

export {
  BrowserConfigSchema,
  ScreenshotOptionsSchema,
  LocatorOptionsSchema,
  NavigationOptionsSchema,
  ClickOptionsSchema,
  TypeOptionsSchema,
  DevServerConfigSchema,
} from './types.js';

// Browser Manager
export {
  BrowserManager,
  getBrowserManager,
  resetBrowserManager,
  type BrowserContext,
} from './manager.js';

// CDP Integration
export {
  CDPSession,
  CDPUtils,
  createCDPUtils,
} from './cdp.js';

// Page Interactions
export {
  PageController,
  createPageController,
} from './page.js';

// UI Verification
export {
  ElementAssertion,
  UIVerifier,
  createUIVerifier,
} from './verify.js';

// Browser Tools
export {
  browserTools,
  getBrowserToolDefinitions,
  getBrowserToolHandler,
  registerBrowserTools,
} from './tools.js';

// Dev Server
export {
  DevServerManager,
  createDevServerManager,
  detectRunningDevServer,
  ensureDevServer,
} from './devserver.js';
