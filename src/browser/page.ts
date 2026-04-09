/**
 * Page interaction utilities
 * High-level API for browser page interactions
 */

import { createLogger } from '../logging/logger.js';
import type { BrowserManager } from './manager.js';
import type {
  NavigationOptions,
  ClickOptions,
  TypeOptions,
  ScreenshotOptions,
  PageSnapshot,
  BrowserAction,
  BrowserActionResult,
  LocatorOptions,
  PageLoadState,
} from './types.js';

const log = createLogger('browser-page');

/**
 * Page controller for high-level interactions
 */
export class PageController {
  private manager: BrowserManager;
  private browserId: string;
  private pageId: string;

  constructor(manager: BrowserManager, browserId: string, pageId: string) {
    this.manager = manager;
    this.browserId = browserId;
    this.pageId = pageId;
  }

  /**
   * Get the underlying Playwright page
   */
  private getPage(): unknown {
    return this.manager.getPage(this.browserId, this.pageId);
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options: Partial<NavigationOptions> = {}): Promise<void> {
    const page = this.getPage();
    log.info('Navigating to URL', { url });

    try {
      await (page as {
        goto: (url: string, opts: unknown) => Promise<unknown>;
      }).goto(url, {
        waitUntil: options.waitUntil || 'load',
        timeout: options.timeout,
        referer: options.referer,
      });

      log.debug('Navigation complete', { url });
    } catch (error) {
      log.error('Navigation failed', { url, error });
      throw error;
    }
  }

  /**
   * Go back in history
   */
  async goBack(options: { waitUntil?: PageLoadState; timeout?: number } = {}): Promise<void> {
    const page = this.getPage();
    await (page as {
      goBack: (opts: unknown) => Promise<unknown>;
    }).goBack({
      waitUntil: options.waitUntil || 'load',
      timeout: options.timeout,
    });
    log.debug('Navigated back');
  }

  /**
   * Go forward in history
   */
  async goForward(options: { waitUntil?: PageLoadState; timeout?: number } = {}): Promise<void> {
    const page = this.getPage();
    await (page as {
      goForward: (opts: unknown) => Promise<unknown>;
    }).goForward({
      waitUntil: options.waitUntil || 'load',
      timeout: options.timeout,
    });
    log.debug('Navigated forward');
  }

  /**
   * Reload the page
   */
  async reload(options: { waitUntil?: PageLoadState; timeout?: number } = {}): Promise<void> {
    const page = this.getPage();
    await (page as {
      reload: (opts: unknown) => Promise<unknown>;
    }).reload({
      waitUntil: options.waitUntil || 'load',
      timeout: options.timeout,
    });
    log.debug('Page reloaded');
  }

  /**
   * Get a locator for an element
   */
  private getLocator(selector: string, strategy: LocatorOptions['strategy'] = 'css'): unknown {
    const page = this.getPage() as {
      locator: (s: string) => unknown;
      getByText: (s: string) => unknown;
      getByRole: (r: string, o: unknown) => unknown;
      getByTestId: (s: string) => unknown;
    };

    switch (strategy) {
      case 'xpath':
        return page.locator(`xpath=${selector}`);
      case 'text':
        return page.getByText(selector);
      case 'role':
        // Parse role[name=value] format
        const roleMatch = selector.match(/^(\w+)(?:\[name=["']?(.+?)["']?\])?$/);
        if (roleMatch && roleMatch[1]) {
          const role = roleMatch[1];
          const name = roleMatch[2];
          return page.getByRole(role, name ? { name } : {});
        }
        return page.getByRole(selector, {});
      case 'testid':
        return page.getByTestId(selector);
      case 'css':
      default:
        return page.locator(selector);
    }
  }

  /**
   * Click an element
   */
  async click(
    selector: string,
    options: Partial<ClickOptions & LocatorOptions> = {}
  ): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Clicking element', { selector });

    await (locator as {
      click: (opts: unknown) => Promise<void>;
    }).click({
      button: options.button || 'left',
      clickCount: options.clickCount || 1,
      delay: options.delay,
      force: options.force,
      modifiers: options.modifiers,
      timeout: options.timeout,
    });
  }

  /**
   * Double click an element
   */
  async dblclick(
    selector: string,
    options: Partial<ClickOptions & LocatorOptions> = {}
  ): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Double clicking element', { selector });

    await (locator as {
      dblclick: (opts: unknown) => Promise<void>;
    }).dblclick({
      button: options.button || 'left',
      delay: options.delay,
      force: options.force,
      modifiers: options.modifiers,
      timeout: options.timeout,
    });
  }

  /**
   * Type text into an element
   */
  async type(
    selector: string,
    text: string,
    options: Partial<TypeOptions & LocatorOptions> = {}
  ): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Typing into element', { selector, textLength: text.length });

    if (options.clear) {
      await (locator as { clear: () => Promise<void> }).clear();
    }

    await (locator as {
      type: (text: string, opts: unknown) => Promise<void>;
    }).type(text, {
      delay: options.delay,
      timeout: options.timeout,
    });
  }

  /**
   * Fill an input element (faster than type, clears first)
   */
  async fill(
    selector: string,
    value: string,
    options: Partial<LocatorOptions> = {}
  ): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Filling element', { selector });

    await (locator as {
      fill: (value: string, opts: unknown) => Promise<void>;
    }).fill(value, {
      timeout: options.timeout,
    });
  }

  /**
   * Clear an input element
   */
  async clear(selector: string, options: Partial<LocatorOptions> = {}): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Clearing element', { selector });

    await (locator as { clear: (opts: unknown) => Promise<void> }).clear({
      timeout: options.timeout,
    });
  }

  /**
   * Select options from a dropdown
   */
  async select(
    selector: string,
    values: string | string[],
    options: Partial<LocatorOptions> = {}
  ): Promise<string[]> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Selecting options', { selector, values });

    return await (locator as {
      selectOption: (values: string | string[], opts: unknown) => Promise<string[]>;
    }).selectOption(values, {
      timeout: options.timeout,
    });
  }

  /**
   * Check a checkbox or radio
   */
  async check(selector: string, options: Partial<LocatorOptions> = {}): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Checking element', { selector });

    await (locator as { check: (opts: unknown) => Promise<void> }).check({
      timeout: options.timeout,
    });
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(selector: string, options: Partial<LocatorOptions> = {}): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Unchecking element', { selector });

    await (locator as { uncheck: (opts: unknown) => Promise<void> }).uncheck({
      timeout: options.timeout,
    });
  }

  /**
   * Hover over an element
   */
  async hover(selector: string, options: Partial<LocatorOptions> = {}): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Hovering element', { selector });

    await (locator as { hover: (opts: unknown) => Promise<void> }).hover({
      timeout: options.timeout,
    });
  }

  /**
   * Focus an element
   */
  async focus(selector: string, options: Partial<LocatorOptions> = {}): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Focusing element', { selector });

    await (locator as { focus: (opts: unknown) => Promise<void> }).focus({
      timeout: options.timeout,
    });
  }

  /**
   * Scroll an element into view or scroll the page
   */
  async scroll(
    options: { selector?: string; x?: number; y?: number } & Partial<LocatorOptions> = {}
  ): Promise<void> {
    const page = this.getPage();

    if (options.selector) {
      const locator = this.getLocator(options.selector, options.strategy);
      await (locator as { scrollIntoViewIfNeeded: (opts: unknown) => Promise<void> }).scrollIntoViewIfNeeded({
        timeout: options.timeout,
      });
      log.debug('Scrolled element into view', { selector: options.selector });
    } else {
      const scrollX = options.x || 0;
      const scrollY = options.y || 0;
      await (page as {
        evaluate: (script: string) => Promise<void>;
      }).evaluate(`window.scrollBy(${scrollX}, ${scrollY})`);
      log.debug('Scrolled page', { x: options.x, y: options.y });
    }
  }

  /**
   * Press a keyboard key
   */
  async press(key: string, options: { delay?: number } = {}): Promise<void> {
    const page = this.getPage();
    log.debug('Pressing key', { key });

    await (page as {
      keyboard: { press: (key: string, opts: unknown) => Promise<void> };
    }).keyboard.press(key, {
      delay: options.delay,
    });
  }

  /**
   * Upload files to a file input
   */
  async upload(
    selector: string,
    files: string | string[],
    options: Partial<LocatorOptions> = {}
  ): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Uploading files', { selector, files });

    await (locator as {
      setInputFiles: (files: string | string[], opts: unknown) => Promise<void>;
    }).setInputFiles(files, {
      timeout: options.timeout,
    });
  }

  /**
   * Take a screenshot
   */
  async screenshot(options: Partial<ScreenshotOptions> = {}): Promise<Buffer> {
    const page = this.getPage();
    log.debug('Taking screenshot', { options });

    return await (page as {
      screenshot: (opts: unknown) => Promise<Buffer>;
    }).screenshot({
      path: options.path,
      type: options.type || 'png',
      quality: options.quality,
      fullPage: options.fullPage,
      clip: options.clip,
      omitBackground: options.omitBackground,
    });
  }

  /**
   * Wait for an element
   */
  async waitForSelector(
    selector: string,
    options: Partial<LocatorOptions> & {
      state?: 'visible' | 'hidden' | 'attached' | 'detached';
    } = {}
  ): Promise<void> {
    const locator = this.getLocator(selector, options.strategy);
    log.debug('Waiting for selector', { selector, state: options.state });

    await (locator as {
      waitFor: (opts: unknown) => Promise<void>;
    }).waitFor({
      state: options.state || 'visible',
      timeout: options.timeout,
    });
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(options: {
    waitUntil?: PageLoadState;
    timeout?: number;
  } = {}): Promise<void> {
    const page = this.getPage();
    log.debug('Waiting for navigation');

    await (page as {
      waitForLoadState: (state: string, opts: unknown) => Promise<void>;
    }).waitForLoadState(options.waitUntil || 'load', {
      timeout: options.timeout,
    });
  }

  /**
   * Wait for a specific timeout
   */
  async wait(timeout: number): Promise<void> {
    const page = this.getPage();
    await (page as {
      waitForTimeout: (timeout: number) => Promise<void>;
    }).waitForTimeout(timeout);
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate<T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
    const page = this.getPage();
    return await (page as {
      evaluate: <R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]) => Promise<R>;
    }).evaluate(fn, ...args);
  }

  /**
   * Get the current URL
   */
  async url(): Promise<string> {
    const page = this.getPage();
    return (page as { url: () => string }).url();
  }

  /**
   * Get the page title
   */
  async title(): Promise<string> {
    const page = this.getPage();
    return await (page as { title: () => Promise<string> }).title();
  }

  /**
   * Get page content (HTML)
   */
  async content(): Promise<string> {
    const page = this.getPage();
    return await (page as { content: () => Promise<string> }).content();
  }

  /**
   * Get inner text of an element
   */
  async innerText(selector: string, options: Partial<LocatorOptions> = {}): Promise<string> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as { innerText: (opts: unknown) => Promise<string> }).innerText({
      timeout: options.timeout,
    });
  }

  /**
   * Get inner HTML of an element
   */
  async innerHTML(selector: string, options: Partial<LocatorOptions> = {}): Promise<string> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as { innerHTML: (opts: unknown) => Promise<string> }).innerHTML({
      timeout: options.timeout,
    });
  }

  /**
   * Get element attribute
   */
  async getAttribute(
    selector: string,
    name: string,
    options: Partial<LocatorOptions> = {}
  ): Promise<string | null> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as {
      getAttribute: (name: string, opts: unknown) => Promise<string | null>;
    }).getAttribute(name, {
      timeout: options.timeout,
    });
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector: string, options: Partial<LocatorOptions> = {}): Promise<boolean> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as { isVisible: (opts: unknown) => Promise<boolean> }).isVisible({
      timeout: options.timeout,
    });
  }

  /**
   * Check if element is enabled
   */
  async isEnabled(selector: string, options: Partial<LocatorOptions> = {}): Promise<boolean> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as { isEnabled: (opts: unknown) => Promise<boolean> }).isEnabled({
      timeout: options.timeout,
    });
  }

  /**
   * Check if element is checked (checkbox/radio)
   */
  async isChecked(selector: string, options: Partial<LocatorOptions> = {}): Promise<boolean> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as { isChecked: (opts: unknown) => Promise<boolean> }).isChecked({
      timeout: options.timeout,
    });
  }

  /**
   * Get element bounding box
   */
  async boundingBox(
    selector: string,
    options: Partial<LocatorOptions> = {}
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as {
      boundingBox: (opts: unknown) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    }).boundingBox({
      timeout: options.timeout,
    });
  }

  /**
   * Get element count
   */
  async count(selector: string, options: Partial<LocatorOptions> = {}): Promise<number> {
    const locator = this.getLocator(selector, options.strategy);
    return await (locator as { count: () => Promise<number> }).count();
  }

  /**
   * Get a page snapshot for agent context
   */
  async getSnapshot(includeScreenshot: boolean = false): Promise<PageSnapshot> {
    const [url, title, text] = await Promise.all([
      this.url(),
      this.title(),
      this.evaluate('document.body.innerText'),
    ]);

    let screenshot: string | undefined;
    if (includeScreenshot) {
      const buffer = await this.screenshot();
      screenshot = buffer.toString('base64');
    }

    const page = this.getPage();
    const viewport = (page as { viewportSize: () => { width: number; height: number } | null }).viewportSize();

    return {
      url,
      title,
      text: text as string,
      screenshot,
      timestamp: new Date(),
      viewport: viewport || { width: 1280, height: 720 },
    };
  }

  /**
   * Execute a browser action
   */
  async executeAction(action: BrowserAction): Promise<BrowserActionResult> {
    const startTime = Date.now();

    try {
      let data: unknown;

      switch (action.type) {
        case 'navigate':
          await this.navigate(action.url, { waitUntil: action.waitUntil });
          break;

        case 'click':
          await this.click(action.selector, action.options);
          break;

        case 'type':
          await this.type(action.selector, action.text, action.options);
          break;

        case 'fill':
          await this.fill(action.selector, action.value);
          break;

        case 'select':
          data = await this.select(action.selector, action.values);
          break;

        case 'check':
          await this.check(action.selector);
          break;

        case 'uncheck':
          await this.uncheck(action.selector);
          break;

        case 'hover':
          await this.hover(action.selector);
          break;

        case 'scroll':
          await this.scroll({
            selector: action.selector,
            x: action.x,
            y: action.y,
          });
          break;

        case 'screenshot':
          const buffer = await this.screenshot(action.options);
          data = buffer.toString('base64');
          break;

        case 'wait':
          if (action.selector) {
            await this.waitForSelector(action.selector, {
              state: action.state,
              timeout: action.timeout,
            });
          } else {
            await this.wait(action.timeout || 1000);
          }
          break;

        case 'evaluate':
          data = await this.evaluate(action.script);
          break;

        case 'press':
          await this.press(action.key);
          break;

        case 'upload':
          await this.upload(action.selector, action.files);
          break;

        case 'close':
          await this.manager.closePage(this.browserId, this.pageId);
          break;

        default:
          throw new Error(`Unknown action type: ${(action as { type: string }).type}`);
      }

      return {
        success: true,
        action,
        data,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        action,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple actions in sequence
   */
  async executeActions(actions: BrowserAction[]): Promise<BrowserActionResult[]> {
    const results: BrowserActionResult[] = [];

    for (const action of actions) {
      const result = await this.executeAction(action);
      results.push(result);

      // Stop on first error unless it's a screenshot
      if (!result.success && action.type !== 'screenshot') {
        break;
      }
    }

    return results;
  }
}

/**
 * Create a page controller
 */
export function createPageController(
  manager: BrowserManager,
  browserId: string,
  pageId: string
): PageController {
  return new PageController(manager, browserId, pageId);
}
