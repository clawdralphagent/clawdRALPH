/**
 * Browser tools for AI agent
 * Tool definitions and handlers for browser automation
 */

import { createLogger } from '../logging/logger.js';
import type { ToolDefinition } from '../ai/types.js';
import type { ToolHandler, ToolContext, ToolExecutionResult } from '../ai/tools.js';
import { getBrowserManager, type BrowserManager } from './manager.js';
import { PageController, createPageController } from './page.js';
import { createUIVerifier } from './verify.js';
import type { BrowserConfig } from './types.js';

const log = createLogger('browser-tools');

/**
 * Browser session state tracked in tool context
 */
interface BrowserToolState {
  browserId?: string;
  pageId?: string;
  manager: BrowserManager;
}

/**
 * Get or create browser state from context
 */
function getBrowserState(context: ToolContext): BrowserToolState {
  if (!context.metadata.browserState) {
    context.metadata.browserState = {
      manager: getBrowserManager(),
    };
  }
  return context.metadata.browserState as BrowserToolState;
}

/**
 * Get active page controller
 */
async function getActiveController(context: ToolContext): Promise<PageController> {
  const state = getBrowserState(context);

  if (!state.browserId || !state.pageId) {
    throw new Error('No active browser session. Use browser_launch first.');
  }

  return createPageController(state.manager, state.browserId, state.pageId);
}

/**
 * Browser launch tool
 */
const browserLaunchTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_launch',
    description: 'Launch a new browser instance. Returns a browser session ID.',
    parameters: {
      type: 'object',
      properties: {
        headless: {
          type: 'boolean',
          description: 'Run in headless mode (no visible window). Default: true',
        },
        browserType: {
          type: 'string',
          description: 'Browser type: chromium, firefox, or webkit. Default: chromium',
          enum: ['chromium', 'firefox', 'webkit'],
        },
      },
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    const state = getBrowserState(context);

    // Close existing browser if any
    if (state.browserId) {
      try {
        await state.manager.close(state.browserId);
      } catch {
        // Ignore close errors
      }
    }

    const config: Partial<BrowserConfig> = {
      mode: args.headless === false ? 'headed' : 'headless',
      browserType: (args.browserType as 'chromium' | 'firefox' | 'webkit') || 'chromium',
    };

    try {
      const browserId = await state.manager.launch(config);
      const pageId = await state.manager.newPage(browserId);

      state.browserId = browserId;
      state.pageId = pageId;

      log.info('Browser launched via tool', { browserId, pageId });

      return {
        success: true,
        content: `Browser launched successfully. Session ID: ${browserId}`,
        data: { browserId, pageId },
      };
    } catch (error) {
      log.error('Browser launch failed', { error });
      return {
        success: false,
        content: `Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser navigate tool
 */
const browserNavigateTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
        waitUntil: {
          type: 'string',
          description: 'When to consider navigation complete: load, domcontentloaded, or networkidle',
          enum: ['load', 'domcontentloaded', 'networkidle'],
        },
      },
      required: ['url'],
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const url = args.url as string;
      const waitUntil = args.waitUntil as 'load' | 'domcontentloaded' | 'networkidle';

      await controller.navigate(url, { waitUntil });

      const title = await controller.title();

      return {
        success: true,
        content: `Navigated to ${url}. Page title: "${title}"`,
        data: { url, title },
      };
    } catch (error) {
      return {
        success: false,
        content: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser click tool
 */
const browserClickTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_click',
    description: 'Click an element on the page',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector, XPath, or text to find the element',
        },
        strategy: {
          type: 'string',
          description: 'Selector strategy: css, xpath, text, role, or testid',
          enum: ['css', 'xpath', 'text', 'role', 'testid'],
        },
      },
      required: ['selector'],
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const selector = args.selector as string;
      const strategy = args.strategy as 'css' | 'xpath' | 'text' | 'role' | 'testid';

      await controller.click(selector, { strategy });

      return {
        success: true,
        content: `Clicked element: "${selector}"`,
      };
    } catch (error) {
      return {
        success: false,
        content: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser type/fill tool
 */
const browserTypeTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_type',
    description: 'Type text into an input field',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input field',
        },
        text: {
          type: 'string',
          description: 'Text to type into the field',
        },
        clear: {
          type: 'boolean',
          description: 'Clear the field before typing. Default: true',
        },
      },
      required: ['selector', 'text'],
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const selector = args.selector as string;
      const text = args.text as string;
      const clear = args.clear !== false;

      if (clear) {
        await controller.fill(selector, text);
      } else {
        await controller.type(selector, text);
      }

      return {
        success: true,
        content: `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into "${selector}"`,
      };
    } catch (error) {
      return {
        success: false,
        content: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser screenshot tool
 */
const browserScreenshotTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page',
    parameters: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Capture the full scrollable page. Default: false',
        },
        path: {
          type: 'string',
          description: 'File path to save the screenshot (optional)',
        },
      },
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const fullPage = args.fullPage === true;
      const filePath = args.path as string | undefined;

      const buffer = await controller.screenshot({
        fullPage,
        path: filePath,
      });

      const base64 = buffer.toString('base64');

      return {
        success: true,
        content: filePath
          ? `Screenshot saved to ${filePath}`
          : `Screenshot taken (${buffer.length} bytes)`,
        data: {
          screenshot: base64,
          size: buffer.length,
          path: filePath,
        },
      };
    } catch (error) {
      return {
        success: false,
        content: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser get content tool
 */
const browserGetContentTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_get_content',
    description: 'Get the text content or HTML of the current page or an element',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to get content from (optional, defaults to whole page)',
        },
        type: {
          type: 'string',
          description: 'Content type to get: text or html',
          enum: ['text', 'html'],
        },
      },
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const selector = args.selector as string | undefined;
      const contentType = (args.type as 'text' | 'html') || 'text';

      let content: string;

      if (selector) {
        if (contentType === 'html') {
          content = await controller.innerHTML(selector);
        } else {
          content = await controller.innerText(selector);
        }
      } else {
        if (contentType === 'html') {
          content = await controller.content();
        } else {
          content = await controller.evaluate('document.body.innerText') as string;
        }
      }

      // Truncate if too long
      const maxLength = 10000;
      const truncated = content.length > maxLength;
      if (truncated) {
        content = content.slice(0, maxLength) + '\n... (truncated)';
      }

      return {
        success: true,
        content: content,
        data: { truncated, originalLength: content.length },
      };
    } catch (error) {
      return {
        success: false,
        content: `Failed to get content: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser wait tool
 */
const browserWaitTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_wait',
    description: 'Wait for an element or a timeout',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to wait for (optional)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 5000)',
        },
        state: {
          type: 'string',
          description: 'Element state to wait for: visible, hidden, attached, detached',
          enum: ['visible', 'hidden', 'attached', 'detached'],
        },
      },
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const selector = args.selector as string | undefined;
      const timeout = (args.timeout as number) || 5000;
      const state = args.state as 'visible' | 'hidden' | 'attached' | 'detached';

      if (selector) {
        await controller.waitForSelector(selector, { state, timeout });
        return {
          success: true,
          content: `Element "${selector}" is now ${state || 'visible'}`,
        };
      } else {
        await controller.wait(timeout);
        return {
          success: true,
          content: `Waited for ${timeout}ms`,
        };
      }
    } catch (error) {
      return {
        success: false,
        content: `Wait failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser evaluate tool
 */
const browserEvaluateTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_evaluate',
    description: 'Execute JavaScript in the browser page context',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute',
        },
      },
      required: ['script'],
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const script = args.script as string;

      const result = await controller.evaluate(script);

      return {
        success: true,
        content: `Script executed. Result: ${JSON.stringify(result, null, 2)}`,
        data: { result },
      };
    } catch (error) {
      return {
        success: false,
        content: `Script execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser verify tool
 */
const browserVerifyTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_verify',
    description: 'Verify UI elements exist and have expected properties',
    parameters: {
      type: 'object',
      properties: {
        checks: {
          type: 'array',
          description: 'Array of verification checks',
          items: {
            type: 'object',
          },
        },
      },
      required: ['checks'],
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const state = getBrowserState(context);
      if (!state.browserId || !state.pageId) {
        throw new Error('No active browser session');
      }

      const verifier = createUIVerifier(state.manager, state.browserId, state.pageId);
      const checks = args.checks as Array<{
        selector: string;
        check: string;
        value?: string;
      }>;

      const results: Array<{ selector: string; check: string; passed: boolean; message: string }> = [];

      for (const check of checks) {
        const assertion = verifier.expect(check.selector);

        switch (check.check) {
          case 'visible':
            await assertion.isVisible();
            break;
          case 'hidden':
            await assertion.isHidden();
            break;
          case 'enabled':
            await assertion.isEnabled();
            break;
          case 'disabled':
            await assertion.isDisabled();
            break;
          case 'hasText':
            await assertion.hasText(check.value || '');
            break;
          case 'hasClass':
            await assertion.hasClass(check.value || '');
            break;
          default:
            await assertion.isVisible();
        }

        const checkResults = assertion.getChecks();
        for (const result of checkResults) {
          results.push({
            selector: check.selector,
            check: check.check,
            passed: result.passed,
            message: result.message,
          });
        }
      }

      const allPassed = results.every((r) => r.passed);

      return {
        success: allPassed,
        content: allPassed
          ? `All ${results.length} verification checks passed`
          : `${results.filter((r) => !r.passed).length} of ${results.length} checks failed`,
        data: { results },
      };
    } catch (error) {
      return {
        success: false,
        content: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser close tool
 */
const browserCloseTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_close',
    description: 'Close the browser session',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  handler: async (_args, context): Promise<ToolExecutionResult> => {
    try {
      const state = getBrowserState(context);

      if (state.browserId) {
        await state.manager.close(state.browserId);
        state.browserId = undefined;
        state.pageId = undefined;

        return {
          success: true,
          content: 'Browser closed successfully',
        };
      }

      return {
        success: true,
        content: 'No active browser session to close',
      };
    } catch (error) {
      return {
        success: false,
        content: `Failed to close browser: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Browser get snapshot tool (for agent context)
 */
const browserSnapshotTool: { definition: ToolDefinition; handler: ToolHandler } = {
  definition: {
    name: 'browser_snapshot',
    description: 'Get a snapshot of the current page state including URL, title, and visible text',
    parameters: {
      type: 'object',
      properties: {
        includeScreenshot: {
          type: 'boolean',
          description: 'Include a screenshot in the snapshot',
        },
      },
    },
  },
  handler: async (args, context): Promise<ToolExecutionResult> => {
    try {
      const controller = await getActiveController(context);
      const includeScreenshot = args.includeScreenshot === true;

      const snapshot = await controller.getSnapshot(includeScreenshot);

      // Truncate text for response
      const maxTextLength = 5000;
      let text = snapshot.text || '';
      if (text.length > maxTextLength) {
        text = text.slice(0, maxTextLength) + '\n... (truncated)';
      }

      return {
        success: true,
        content: `Page: ${snapshot.title}\nURL: ${snapshot.url}\n\nContent:\n${text}`,
        data: {
          url: snapshot.url,
          title: snapshot.title,
          screenshot: snapshot.screenshot,
          viewport: snapshot.viewport,
        },
      };
    } catch (error) {
      return {
        success: false,
        content: `Failed to get snapshot: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * All browser tools
 */
export const browserTools = [
  browserLaunchTool,
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserScreenshotTool,
  browserGetContentTool,
  browserWaitTool,
  browserEvaluateTool,
  browserVerifyTool,
  browserCloseTool,
  browserSnapshotTool,
];

/**
 * Get browser tool definitions
 */
export function getBrowserToolDefinitions(): ToolDefinition[] {
  return browserTools.map((t) => t.definition);
}

/**
 * Get browser tool handler by name
 */
export function getBrowserToolHandler(name: string): ToolHandler | undefined {
  const tool = browserTools.find((t) => t.definition.name === name);
  return tool?.handler;
}

/**
 * Register all browser tools with a tool registry
 */
export function registerBrowserTools(registry: {
  register: (definition: ToolDefinition, handler: ToolHandler) => void;
}): void {
  for (const tool of browserTools) {
    registry.register(tool.definition, tool.handler);
  }

  log.info('Browser tools registered', { count: browserTools.length });
}
