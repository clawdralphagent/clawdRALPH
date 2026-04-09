/**
 * Browser lifecycle manager
 * Handles browser instance creation, management, and cleanup
 */

import { createLogger } from '../logging/logger.js';
import { v4 as uuid } from 'uuid';
import {
  BrowserConfigSchema,
  type BrowserType,
  type BrowserMode,
  type BrowserConfig,
  type BrowserInstance,
} from './types.js';

const log = createLogger('browser-manager');

/**
 * Browser context wrapper
 * Abstracts Playwright browser operations
 */
export interface BrowserContext {
  id: string;
  browser: unknown; // Playwright Browser
  context: unknown; // Playwright BrowserContext
  pages: Map<string, unknown>; // Playwright Page
}

/**
 * Browser manager for lifecycle management
 */
export class BrowserManager {
  private instances: Map<string, BrowserInstance> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private config: BrowserConfig;
  private playwright: unknown = null;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = BrowserConfigSchema.parse(config);
  }

  /**
   * Initialize Playwright (lazy load)
   */
  private async getPlaywright(): Promise<unknown> {
    if (!this.playwright) {
      try {
        // Dynamic import of playwright
        const pw = await import('playwright');
        this.playwright = pw;
        log.debug('Playwright loaded successfully');
      } catch (error) {
        log.error('Failed to load Playwright', { error });
        throw new Error(
          'Playwright is not installed. Run: npm install playwright && npx playwright install'
        );
      }
    }
    return this.playwright;
  }

  /**
   * Launch a new browser instance
   */
  async launch(options: Partial<BrowserConfig> = {}): Promise<string> {
    const config = { ...this.config, ...options };
    const instanceId = uuid();

    log.info('Launching browser', {
      id: instanceId,
      type: config.browserType,
      mode: config.mode,
    });

    // Create instance record
    const instance: BrowserInstance = {
      id: instanceId,
      type: config.browserType as BrowserType,
      mode: config.mode as BrowserMode,
      state: 'launching',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      pageCount: 0,
    };

    this.instances.set(instanceId, instance);

    try {
      const pw = (await this.getPlaywright()) as {
        chromium: { launch: (opts: unknown) => Promise<unknown> };
        firefox: { launch: (opts: unknown) => Promise<unknown> };
        webkit: { launch: (opts: unknown) => Promise<unknown> };
      };

      // Get browser launcher based on type
      const browserLauncher = pw[config.browserType as keyof typeof pw];
      if (!browserLauncher) {
        throw new Error(`Unsupported browser type: ${config.browserType}`);
      }

      // Launch options
      const launchOptions = {
        headless: config.mode === 'headless',
        executablePath: config.executablePath,
        args: config.extraArgs,
        slowMo: config.slowMo,
        timeout: config.defaultTimeout,
        ignoreHTTPSErrors: config.ignoreHTTPSErrors,
        proxy: config.proxy,
      };

      // Launch browser
      const browser = await browserLauncher.launch(launchOptions);

      // Create default context
      const context = await (browser as { newContext: (opts: unknown) => Promise<unknown> }).newContext({
        viewport: config.viewport,
        userAgent: this.getDefaultUserAgent(config.browserType as BrowserType),
        ignoreHTTPSErrors: config.ignoreHTTPSErrors,
      });

      // Store browser context
      this.contexts.set(instanceId, {
        id: instanceId,
        browser,
        context,
        pages: new Map(),
      });

      // Get WebSocket endpoint if available
      const wsEndpoint = await this.getWsEndpoint(browser);

      // Update instance state
      instance.state = 'running';
      instance.wsEndpoint = wsEndpoint;
      instance.pid = this.getBrowserPid(browser);
      instance.lastActivityAt = new Date();

      log.info('Browser launched successfully', {
        id: instanceId,
        wsEndpoint,
        pid: instance.pid,
      });

      return instanceId;
    } catch (error) {
      instance.state = 'error';
      log.error('Failed to launch browser', { id: instanceId, error });
      throw error;
    }
  }

  /**
   * Get browser WebSocket endpoint
   */
  private async getWsEndpoint(browser: unknown): Promise<string | undefined> {
    try {
      const b = browser as { wsEndpoint?: () => string };
      return b.wsEndpoint?.();
    } catch {
      return undefined;
    }
  }

  /**
   * Get browser process ID
   */
  private getBrowserPid(browser: unknown): number | undefined {
    try {
      const b = browser as { process?: () => { pid?: number } | null };
      return b.process?.()?.pid;
    } catch {
      return undefined;
    }
  }

  /**
   * Get default user agent for browser type
   */
  private getDefaultUserAgent(browserType: BrowserType): string {
    const agents: Record<BrowserType, string> = {
      chromium:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      firefox:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      webkit:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    };
    return agents[browserType];
  }

  /**
   * Create a new page in the browser
   */
  async newPage(browserId: string): Promise<string> {
    const ctx = this.contexts.get(browserId);
    if (!ctx) {
      throw new Error(`Browser not found: ${browserId}`);
    }

    const pageId = uuid();
    const page = await (ctx.context as { newPage: () => Promise<unknown> }).newPage();
    ctx.pages.set(pageId, page);

    // Update instance
    const instance = this.instances.get(browserId);
    if (instance) {
      instance.pageCount = ctx.pages.size;
      instance.lastActivityAt = new Date();
    }

    log.debug('New page created', { browserId, pageId });
    return pageId;
  }

  /**
   * Get a page by ID
   */
  getPage(browserId: string, pageId: string): unknown {
    const ctx = this.contexts.get(browserId);
    if (!ctx) {
      throw new Error(`Browser not found: ${browserId}`);
    }

    const page = ctx.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    return page;
  }

  /**
   * Close a specific page
   */
  async closePage(browserId: string, pageId: string): Promise<void> {
    const ctx = this.contexts.get(browserId);
    if (!ctx) {
      throw new Error(`Browser not found: ${browserId}`);
    }

    const page = ctx.pages.get(pageId);
    if (page) {
      await (page as { close: () => Promise<void> }).close();
      ctx.pages.delete(pageId);

      // Update instance
      const instance = this.instances.get(browserId);
      if (instance) {
        instance.pageCount = ctx.pages.size;
        instance.lastActivityAt = new Date();
      }

      log.debug('Page closed', { browserId, pageId });
    }
  }

  /**
   * Close a browser instance
   */
  async close(browserId: string): Promise<void> {
    const ctx = this.contexts.get(browserId);
    const instance = this.instances.get(browserId);

    if (!ctx || !instance) {
      log.warn('Browser not found for close', { browserId });
      return;
    }

    log.info('Closing browser', { browserId });
    instance.state = 'closing';

    try {
      // Close all pages first
      for (const [pageId, page] of ctx.pages) {
        try {
          await (page as { close: () => Promise<void> }).close();
        } catch (error) {
          log.warn('Error closing page', { browserId, pageId, error });
        }
      }
      ctx.pages.clear();

      // Close browser
      await (ctx.browser as { close: () => Promise<void> }).close();

      // Update state
      instance.state = 'closed';
      instance.pageCount = 0;

      // Cleanup
      this.contexts.delete(browserId);
      this.instances.delete(browserId);

      log.info('Browser closed successfully', { browserId });
    } catch (error) {
      instance.state = 'error';
      log.error('Error closing browser', { browserId, error });
      throw error;
    }
  }

  /**
   * Close all browser instances
   */
  async closeAll(): Promise<void> {
    log.info('Closing all browsers', { count: this.instances.size });

    const closePromises = Array.from(this.instances.keys()).map((id) =>
      this.close(id).catch((error) => {
        log.error('Error closing browser during closeAll', { id, error });
      })
    );

    await Promise.all(closePromises);
    log.info('All browsers closed');
  }

  /**
   * Get browser instance info
   */
  getInstance(browserId: string): BrowserInstance | undefined {
    return this.instances.get(browserId);
  }

  /**
   * Get all browser instances
   */
  getInstances(): BrowserInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Check if a browser is running
   */
  isRunning(browserId: string): boolean {
    const instance = this.instances.get(browserId);
    return instance?.state === 'running';
  }

  /**
   * Get browser context
   */
  getContext(browserId: string): BrowserContext | undefined {
    return this.contexts.get(browserId);
  }

  /**
   * Connect to an existing browser via CDP
   */
  async connectCDP(wsEndpoint: string): Promise<string> {
    const instanceId = uuid();

    log.info('Connecting to browser via CDP', { wsEndpoint });

    const instance: BrowserInstance = {
      id: instanceId,
      type: 'chromium',
      mode: 'headed',
      state: 'launching',
      wsEndpoint,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      pageCount: 0,
    };

    this.instances.set(instanceId, instance);

    try {
      const pw = (await this.getPlaywright()) as {
        chromium: { connectOverCDP: (endpoint: string) => Promise<unknown> };
      };

      const browser = await pw.chromium.connectOverCDP(wsEndpoint);

      // Get default context
      const contexts = await (browser as { contexts: () => unknown[] }).contexts();
      const context = contexts[0] || await (browser as { newContext: () => Promise<unknown> }).newContext();

      this.contexts.set(instanceId, {
        id: instanceId,
        browser,
        context,
        pages: new Map(),
      });

      instance.state = 'running';
      instance.lastActivityAt = new Date();

      log.info('Connected to browser via CDP', { instanceId });
      return instanceId;
    } catch (error) {
      instance.state = 'error';
      log.error('Failed to connect via CDP', { wsEndpoint, error });
      throw error;
    }
  }

  /**
   * Take a screenshot of the current browser state
   */
  async screenshot(browserId: string, pageId: string): Promise<Buffer> {
    const page = this.getPage(browserId, pageId);
    const screenshot = await (page as { screenshot: (opts: unknown) => Promise<Buffer> }).screenshot({
      type: 'png',
      fullPage: false,
    });

    // Update activity
    const instance = this.instances.get(browserId);
    if (instance) {
      instance.lastActivityAt = new Date();
    }

    return screenshot;
  }

  /**
   * Get browser stats
   */
  getStats(): {
    totalInstances: number;
    runningInstances: number;
    totalPages: number;
  } {
    let runningInstances = 0;
    let totalPages = 0;

    for (const instance of this.instances.values()) {
      if (instance.state === 'running') {
        runningInstances++;
      }
      totalPages += instance.pageCount;
    }

    return {
      totalInstances: this.instances.size,
      runningInstances,
      totalPages,
    };
  }
}

/**
 * Singleton browser manager instance
 */
let defaultManager: BrowserManager | null = null;

/**
 * Get the default browser manager
 */
export function getBrowserManager(config?: Partial<BrowserConfig>): BrowserManager {
  if (!defaultManager) {
    defaultManager = new BrowserManager(config);
  }
  return defaultManager;
}

/**
 * Reset the default browser manager
 */
export async function resetBrowserManager(): Promise<void> {
  if (defaultManager) {
    await defaultManager.closeAll();
    defaultManager = null;
  }
}
