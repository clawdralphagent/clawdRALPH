/**
 * Chrome DevTools Protocol integration
 * Direct CDP communication for advanced browser control
 */

import { createLogger } from '../logging/logger.js';
import type { BrowserManager } from './manager.js';
import type { ElementInfo } from './types.js';

const log = createLogger('browser-cdp');

/**
 * CDP session wrapper for direct protocol access
 */
export class CDPSession {
  private session: unknown = null;
  private browserId: string;
  private pageId: string;
  private manager: BrowserManager;

  constructor(manager: BrowserManager, browserId: string, pageId: string) {
    this.manager = manager;
    this.browserId = browserId;
    this.pageId = pageId;
  }

  /**
   * Initialize CDP session
   */
  async connect(): Promise<void> {
    const page = this.manager.getPage(this.browserId, this.pageId);
    if (!page) {
      throw new Error('Page not found');
    }

    try {
      // Get CDP session from Playwright page
      const client = await (page as { context: () => { newCDPSession: (p: unknown) => Promise<unknown> } })
        .context()
        .newCDPSession(page);
      this.session = client;
      log.debug('CDP session connected', { browserId: this.browserId, pageId: this.pageId });
    } catch (error) {
      log.error('Failed to create CDP session', { error });
      throw error;
    }
  }

  /**
   * Send a CDP command
   */
  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.session) {
      throw new Error('CDP session not connected');
    }

    try {
      log.debug('CDP send', { method, params });
      const result = await (this.session as { send: (m: string, p: unknown) => Promise<unknown> }).send(
        method,
        params
      );
      return result;
    } catch (error) {
      log.error('CDP command failed', { method, error });
      throw error;
    }
  }

  /**
   * Subscribe to CDP events
   */
  on(event: string, handler: (params: unknown) => void): void {
    if (!this.session) {
      throw new Error('CDP session not connected');
    }

    (this.session as { on: (e: string, h: (p: unknown) => void) => void }).on(event, handler);
    log.debug('CDP event subscribed', { event });
  }

  /**
   * Unsubscribe from CDP events
   */
  off(event: string, handler: (params: unknown) => void): void {
    if (!this.session) {
      return;
    }

    (this.session as { off: (e: string, h: (p: unknown) => void) => void }).off(event, handler);
  }

  /**
   * Detach CDP session
   */
  async detach(): Promise<void> {
    if (this.session) {
      try {
        await (this.session as { detach: () => Promise<void> }).detach();
        log.debug('CDP session detached');
      } catch (error) {
        log.warn('Error detaching CDP session', { error });
      }
      this.session = null;
    }
  }
}

/**
 * CDP utilities for common operations
 */
export class CDPUtils {
  private manager: BrowserManager;

  constructor(manager: BrowserManager) {
    this.manager = manager;
  }

  /**
   * Get DOM snapshot via CDP
   */
  async getDOMSnapshot(
    browserId: string,
    pageId: string
  ): Promise<{
    documents: unknown[];
    strings: string[];
  }> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      // Enable DOM domain
      await session.send('DOM.enable');

      // Get document
      const result = await session.send('DOMSnapshot.captureSnapshot', {
        computedStyles: ['display', 'visibility', 'opacity'],
        includeDOMRects: true,
        includePaintOrder: true,
      });

      return result as { documents: unknown[]; strings: string[] };
    } finally {
      await session.detach();
    }
  }

  /**
   * Get accessibility tree via CDP
   */
  async getAccessibilityTree(
    browserId: string,
    pageId: string
  ): Promise<{ nodes: unknown[] }> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('Accessibility.enable');
      const result = await session.send('Accessibility.getFullAXTree');
      return result as { nodes: unknown[] };
    } finally {
      await session.detach();
    }
  }

  /**
   * Enable network interception via CDP
   */
  async enableNetworkInterception(
    browserId: string,
    pageId: string,
    patterns: string[]
  ): Promise<CDPSession> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    await session.send('Fetch.enable', {
      patterns: patterns.map((pattern) => ({
        urlPattern: pattern,
        requestStage: 'Request',
      })),
    });

    log.info('Network interception enabled', { patterns });
    return session;
  }

  /**
   * Get performance metrics via CDP
   */
  async getPerformanceMetrics(
    browserId: string,
    pageId: string
  ): Promise<Record<string, number>> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('Performance.enable');
      const result = (await session.send('Performance.getMetrics')) as {
        metrics: Array<{ name: string; value: number }>;
      };

      const metrics: Record<string, number> = {};
      for (const metric of result.metrics) {
        metrics[metric.name] = metric.value;
      }

      return metrics;
    } finally {
      await session.detach();
    }
  }

  /**
   * Get computed styles for an element via CDP
   */
  async getComputedStyles(
    browserId: string,
    pageId: string,
    nodeId: number
  ): Promise<Record<string, string>> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('DOM.enable');
      await session.send('CSS.enable');

      const result = (await session.send('CSS.getComputedStyleForNode', {
        nodeId,
      })) as {
        computedStyle: Array<{ name: string; value: string }>;
      };

      const styles: Record<string, string> = {};
      for (const style of result.computedStyle) {
        styles[style.name] = style.value;
      }

      return styles;
    } finally {
      await session.detach();
    }
  }

  /**
   * Emulate device via CDP
   */
  async emulateDevice(
    browserId: string,
    pageId: string,
    device: {
      width: number;
      height: number;
      deviceScaleFactor: number;
      mobile: boolean;
      userAgent?: string;
    }
  ): Promise<void> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: device.width,
        height: device.height,
        deviceScaleFactor: device.deviceScaleFactor,
        mobile: device.mobile,
      });

      if (device.userAgent) {
        await session.send('Emulation.setUserAgentOverride', {
          userAgent: device.userAgent,
        });
      }

      log.info('Device emulation set', { device });
    } finally {
      await session.detach();
    }
  }

  /**
   * Get page info via CDP
   */
  async getPageInfo(
    browserId: string,
    pageId: string
  ): Promise<{
    frameId: string;
    url: string;
    securityOrigin: string;
    mimeType: string;
  }> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('Page.enable');
      const result = (await session.send('Page.getFrameTree')) as {
        frameTree: {
          frame: {
            id: string;
            url: string;
            securityOrigin: string;
            mimeType: string;
          };
        };
      };

      return {
        frameId: result.frameTree.frame.id,
        url: result.frameTree.frame.url,
        securityOrigin: result.frameTree.frame.securityOrigin,
        mimeType: result.frameTree.frame.mimeType,
      };
    } finally {
      await session.detach();
    }
  }

  /**
   * Capture full page screenshot via CDP (bypassing viewport)
   */
  async captureFullPageScreenshot(
    browserId: string,
    pageId: string
  ): Promise<string> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      // Get page dimensions
      const layout = (await session.send('Page.getLayoutMetrics')) as {
        contentSize: { width: number; height: number };
      };

      // Capture screenshot with full dimensions
      const result = (await session.send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: 0,
          y: 0,
          width: layout.contentSize.width,
          height: layout.contentSize.height,
          scale: 1,
        },
        captureBeyondViewport: true,
      })) as { data: string };

      return result.data; // Base64 encoded
    } finally {
      await session.detach();
    }
  }

  /**
   * Execute JavaScript in page context via CDP
   */
  async evaluate(
    browserId: string,
    pageId: string,
    expression: string,
    awaitPromise: boolean = true
  ): Promise<unknown> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('Runtime.enable');
      const result = (await session.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
      })) as {
        result: { value?: unknown; description?: string };
        exceptionDetails?: { exception: { description: string } };
      };

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception.description);
      }

      return result.result.value;
    } finally {
      await session.detach();
    }
  }

  /**
   * Get console messages via CDP
   */
  async enableConsoleMessages(
    browserId: string,
    pageId: string,
    callback: (message: { type: string; text: string; timestamp: number }) => void
  ): Promise<CDPSession> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    await session.send('Console.enable');

    session.on('Console.messageAdded', (params: unknown) => {
      const p = params as { message: { level: string; text: string } };
      callback({
        type: p.message.level,
        text: p.message.text,
        timestamp: Date.now(),
      });
    });

    return session;
  }

  /**
   * Get element by point via CDP
   */
  async getElementAtPoint(
    browserId: string,
    pageId: string,
    x: number,
    y: number
  ): Promise<ElementInfo | null> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('DOM.enable');

      // Get document (required before querying nodes)
      await session.send('DOM.getDocument');

      // Get node at point
      const nodeResult = (await session.send('DOM.getNodeForLocation', {
        x,
        y,
      })) as { nodeId: number; backendNodeId: number };

      if (!nodeResult.nodeId) {
        return null;
      }

      // Get node details
      const nodeDetails = (await session.send('DOM.describeNode', {
        nodeId: nodeResult.nodeId,
      })) as {
        node: {
          nodeName: string;
          nodeId: number;
          attributes?: string[];
        };
      };

      // Get box model
      let boundingBox: ElementInfo['boundingBox'] = undefined;
      try {
        const boxModel = (await session.send('DOM.getBoxModel', {
          nodeId: nodeResult.nodeId,
        })) as {
          model: { content: number[] };
        };

        const content = boxModel.model.content;
        if (content && content.length >= 6) {
          boundingBox = {
            x: content[0] ?? 0,
            y: content[1] ?? 0,
            width: (content[2] ?? 0) - (content[0] ?? 0),
            height: (content[5] ?? 0) - (content[1] ?? 0),
          };
        }
      } catch {
        // Box model might not be available for all elements
      }

      // Parse attributes
      const attributes: Record<string, string> = {};
      if (nodeDetails.node.attributes) {
        for (let i = 0; i < nodeDetails.node.attributes.length; i += 2) {
          const key = nodeDetails.node.attributes[i];
          const value = nodeDetails.node.attributes[i + 1];
          if (key !== undefined && value !== undefined) {
            attributes[key] = value;
          }
        }
      }

      return {
        tagName: nodeDetails.node.nodeName.toLowerCase(),
        id: attributes.id,
        className: attributes.class,
        attributes,
        boundingBox,
        isVisible: true, // Would need more checks
        isEnabled: true,
        isEditable: ['input', 'textarea', 'select'].includes(
          nodeDetails.node.nodeName.toLowerCase()
        ),
      };
    } finally {
      await session.detach();
    }
  }

  /**
   * Set cookie via CDP
   */
  async setCookie(
    browserId: string,
    pageId: string,
    cookie: {
      name: string;
      value: string;
      domain?: string;
      path?: string;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
      expires?: number;
    }
  ): Promise<void> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      await session.send('Network.setCookie', cookie);
      log.debug('Cookie set via CDP', { name: cookie.name });
    } finally {
      await session.detach();
    }
  }

  /**
   * Clear browser data via CDP
   */
  async clearBrowserData(
    browserId: string,
    pageId: string,
    options: {
      cookies?: boolean;
      cache?: boolean;
      localStorage?: boolean;
      sessionStorage?: boolean;
    } = {}
  ): Promise<void> {
    const session = new CDPSession(this.manager, browserId, pageId);
    await session.connect();

    try {
      if (options.cookies !== false) {
        await session.send('Network.clearBrowserCookies');
      }

      if (options.cache !== false) {
        await session.send('Network.clearBrowserCache');
      }

      if (options.localStorage || options.sessionStorage) {
        // Use Runtime to clear storage
        let script = '';
        if (options.localStorage) {
          script += 'localStorage.clear();';
        }
        if (options.sessionStorage) {
          script += 'sessionStorage.clear();';
        }

        await session.send('Runtime.evaluate', {
          expression: script,
        });
      }

      log.info('Browser data cleared via CDP', { options });
    } finally {
      await session.detach();
    }
  }
}

/**
 * Create CDP utilities instance
 */
export function createCDPUtils(manager: BrowserManager): CDPUtils {
  return new CDPUtils(manager);
}
