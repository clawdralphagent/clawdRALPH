/**
 * Playwright type declarations stub
 * This allows the browser module to compile even when playwright is not installed
 */

declare module 'playwright' {
  export const chromium: BrowserType;
  export const firefox: BrowserType;
  export const webkit: BrowserType;

  interface BrowserType {
    launch(options?: LaunchOptions): Promise<Browser>;
    connectOverCDP(wsEndpoint: string): Promise<Browser>;
  }

  interface LaunchOptions {
    headless?: boolean;
    executablePath?: string;
    args?: string[];
    slowMo?: number;
    timeout?: number;
    ignoreHTTPSErrors?: boolean;
    proxy?: {
      server: string;
      username?: string;
      password?: string;
    };
  }

  interface Browser {
    newContext(options?: ContextOptions): Promise<BrowserContext>;
    contexts(): BrowserContext[];
    close(): Promise<void>;
    wsEndpoint?(): string;
    process?(): { pid?: number } | null;
  }

  interface ContextOptions {
    viewport?: { width: number; height: number };
    userAgent?: string;
    ignoreHTTPSErrors?: boolean;
  }

  interface BrowserContext {
    newPage(): Promise<Page>;
    newCDPSession(page: Page): Promise<CDPSession>;
  }

  interface Page {
    goto(url: string, options?: { waitUntil?: string; timeout?: number; referer?: string }): Promise<unknown>;
    goBack(options?: unknown): Promise<unknown>;
    goForward(options?: unknown): Promise<unknown>;
    reload(options?: unknown): Promise<unknown>;
    locator(selector: string): Locator;
    getByText(text: string): Locator;
    getByRole(role: string, options?: { name?: string }): Locator;
    getByTestId(testId: string): Locator;
    screenshot(options?: unknown): Promise<Buffer>;
    waitForLoadState(state: string, options?: unknown): Promise<void>;
    waitForTimeout(timeout: number): Promise<void>;
    evaluate<T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T>;
    url(): string;
    title(): Promise<string>;
    content(): Promise<string>;
    close(): Promise<void>;
    viewportSize(): { width: number; height: number } | null;
    keyboard: {
      press(key: string, options?: unknown): Promise<void>;
    };
  }

  interface Locator {
    click(options?: unknown): Promise<void>;
    dblclick(options?: unknown): Promise<void>;
    type(text: string, options?: unknown): Promise<void>;
    fill(value: string, options?: unknown): Promise<void>;
    clear(options?: unknown): Promise<void>;
    selectOption(values: string | string[], options?: unknown): Promise<string[]>;
    check(options?: unknown): Promise<void>;
    uncheck(options?: unknown): Promise<void>;
    hover(options?: unknown): Promise<void>;
    focus(options?: unknown): Promise<void>;
    scrollIntoViewIfNeeded(options?: unknown): Promise<void>;
    setInputFiles(files: string | string[], options?: unknown): Promise<void>;
    waitFor(options?: unknown): Promise<void>;
    innerText(options?: unknown): Promise<string>;
    innerHTML(options?: unknown): Promise<string>;
    getAttribute(name: string, options?: unknown): Promise<string | null>;
    isVisible(options?: unknown): Promise<boolean>;
    isEnabled(options?: unknown): Promise<boolean>;
    isChecked(options?: unknown): Promise<boolean>;
    boundingBox(options?: unknown): Promise<{ x: number; y: number; width: number; height: number } | null>;
    count(): Promise<number>;
  }

  interface CDPSession {
    send(method: string, params?: unknown): Promise<unknown>;
    on(event: string, handler: (params: unknown) => void): void;
    off(event: string, handler: (params: unknown) => void): void;
    detach(): Promise<void>;
  }
}
