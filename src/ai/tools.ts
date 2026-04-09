/**
 * Tool system for AI agent
 * Provides tool definitions and execution for LLM function calling
 */

import { createLogger } from '../logging/logger.js';
import type { ToolDefinition, ToolCall, ToolResult } from './types.js';

const log = createLogger('tools');

/**
 * Tool handler function type
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolExecutionResult>;

/**
 * Context passed to tool handlers
 */
export interface ToolContext {
  conversationId: string;
  userId?: string;
  channelId?: string;
  metadata: Record<string, unknown>;
}

/**
 * Result from tool execution
 */
export interface ToolExecutionResult {
  success: boolean;
  content: string;
  data?: unknown;
}

/**
 * Registered tool with handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  enabled: boolean;
}

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a new tool
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (this.tools.has(definition.name)) {
      log.warn('Overwriting existing tool', { name: definition.name });
    }

    this.tools.set(definition.name, {
      definition,
      handler,
      enabled: true,
    });

    log.debug('Tool registered', { name: definition.name });
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const deleted = this.tools.delete(name);
    if (deleted) {
      log.debug('Tool unregistered', { name });
    }
    return deleted;
  }

  /**
   * Enable or disable a tool
   */
  setEnabled(name: string, enabled: boolean): void {
    const tool = this.tools.get(name);
    if (tool) {
      tool.enabled = enabled;
      log.debug('Tool enabled state changed', { name, enabled });
    }
  }

  /**
   * Get all tool definitions (only enabled tools)
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.enabled)
      .map((t) => t.definition);
  }

  /**
   * Get a specific tool
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists and is enabled
   */
  has(name: string): boolean {
    const tool = this.tools.get(name);
    return tool !== undefined && tool.enabled;
  }

  /**
   * Execute a tool call
   */
  async execute(
    toolCall: ToolCall,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      log.warn('Tool not found', { name: toolCall.name });
      return {
        toolCallId: toolCall.id,
        content: `Tool "${toolCall.name}" not found`,
        isError: true,
      };
    }

    if (!tool.enabled) {
      log.warn('Tool is disabled', { name: toolCall.name });
      return {
        toolCallId: toolCall.id,
        content: `Tool "${toolCall.name}" is currently disabled`,
        isError: true,
      };
    }

    try {
      log.debug('Executing tool', { name: toolCall.name, args: toolCall.arguments });

      const result = await tool.handler(toolCall.arguments, context);

      log.debug('Tool execution complete', {
        name: toolCall.name,
        success: result.success,
      });

      return {
        toolCallId: toolCall.id,
        content: result.content,
        isError: !result.success,
      };
    } catch (error) {
      log.error('Tool execution failed', { name: toolCall.name, error });

      return {
        toolCallId: toolCall.id,
        content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeAll(
    toolCalls: ToolCall[],
    context: ToolContext
  ): Promise<ToolResult[]> {
    return Promise.all(
      toolCalls.map((tc) => this.execute(tc, context))
    );
  }

  /**
   * List all registered tools
   */
  list(): Array<{ name: string; description: string; enabled: boolean }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      enabled: t.enabled,
    }));
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    log.debug('All tools cleared');
  }
}

/**
 * Create default tools for the agent
 */
export function createDefaultTools(): Array<{ definition: ToolDefinition; handler: ToolHandler }> {
  return [
    // Web search tool
    {
      definition: {
        name: 'web_search',
        description: 'Search the web for information on a given query',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            num_results: {
              type: 'number',
              description: 'Number of results to return (default: 5)',
            },
          },
          required: ['query'],
        },
      },
      handler: async (args) => {
        // Placeholder - would integrate with a search API
        const query = args.query as string;
        return {
          success: true,
          content: `Web search for "${query}" - This is a placeholder. Integrate with a search API for real results.`,
        };
      },
    },

    // Get current time tool
    {
      definition: {
        name: 'get_current_time',
        description: 'Get the current date and time',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Timezone (e.g., "UTC", "America/New_York")',
            },
          },
        },
      },
      handler: async (args) => {
        const tz = (args.timezone as string) || 'UTC';
        try {
          const now = new Date();
          const formatted = now.toLocaleString('en-US', { timeZone: tz });
          return {
            success: true,
            content: `Current time in ${tz}: ${formatted}`,
            data: { timestamp: now.toISOString(), timezone: tz },
          };
        } catch {
          return {
            success: false,
            content: `Invalid timezone: ${tz}`,
          };
        }
      },
    },

    // Calculator tool
    {
      definition: {
        name: 'calculator',
        description: 'Perform mathematical calculations',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)")',
            },
          },
          required: ['expression'],
        },
      },
      handler: async (args) => {
        const expr = args.expression as string;
        try {
          // Basic safe math evaluation
          // Only allow numbers, operators, and basic math functions
          const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
          if (sanitized !== expr) {
            return {
              success: false,
              content: 'Expression contains invalid characters',
            };
          }

          // Use Function constructor for safer eval
          const result = new Function(`return ${sanitized}`)();

          if (typeof result !== 'number' || !Number.isFinite(result)) {
            return {
              success: false,
              content: 'Expression did not evaluate to a valid number',
            };
          }

          return {
            success: true,
            content: `${expr} = ${result}`,
            data: { expression: expr, result },
          };
        } catch (error) {
          return {
            success: false,
            content: `Failed to evaluate: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },

    // Memory/note storage tool
    {
      definition: {
        name: 'remember',
        description: 'Store a piece of information for later recall',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'A short key or label for the information',
            },
            value: {
              type: 'string',
              description: 'The information to remember',
            },
          },
          required: ['key', 'value'],
        },
      },
      handler: async (args, context) => {
        const key = args.key as string;
        const value = args.value as string;

        // Store in context metadata
        if (!context.metadata.memory) {
          context.metadata.memory = {};
        }
        (context.metadata.memory as Record<string, string>)[key] = value;

        return {
          success: true,
          content: `Remembered: "${key}" = "${value}"`,
          data: { key, value },
        };
      },
    },

    // Recall information tool
    {
      definition: {
        name: 'recall',
        description: 'Recall previously stored information',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The key of the information to recall',
            },
          },
          required: ['key'],
        },
      },
      handler: async (args, context) => {
        const key = args.key as string;
        const memory = context.metadata.memory as Record<string, string> | undefined;

        if (!memory || !(key in memory)) {
          return {
            success: false,
            content: `No memory found for key: "${key}"`,
          };
        }

        return {
          success: true,
          content: `Recalled "${key}": ${memory[key]}`,
          data: { key, value: memory[key] },
        };
      },
    },
  ];
}

/**
 * Create and populate a tool registry with default tools
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  for (const { definition, handler } of createDefaultTools()) {
    registry.register(definition, handler);
  }

  return registry;
}
