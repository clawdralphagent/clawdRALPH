/**
 * Ollama AI Provider implementation for local models
 */

import { createLogger } from '../logging/logger.js';
import type {
  AIProvider,
  Message,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ProviderCapabilities,
  ToolDefinition,
  ToolCall,
  OllamaConfig,
} from './types.js';

const log = createLogger('ollama');

/**
 * Ollama API types
 */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  tools?: OllamaTool[];
  options?: {
    temperature?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

/**
 * Map our message format to Ollama format
 */
function toOllamaMessages(messages: Message[], systemPrompt?: string): OllamaMessage[] {
  const result: OllamaMessage[] = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const m of messages) {
    if (m.role === 'system' && !systemPrompt) {
      result.push({ role: 'system', content: m.content });
    } else if (m.role === 'user' || m.role === 'assistant') {
      result.push({ role: m.role, content: m.content });
    }
  }

  return result;
}

/**
 * Map tool definitions to Ollama format
 */
function toOllamaTools(tools: ToolDefinition[]): OllamaTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
  }));
}

/**
 * Ollama AI Provider for local models
 */
export class OllamaProvider implements AIProvider {
  readonly type = 'ollama' as const;

  private baseUrl: string;
  private config: OllamaConfig;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? 'http://localhost:11434',
      defaultModel: config.defaultModel ?? 'llama3.2',
    };
    this.baseUrl = this.config.baseUrl;
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: false, // Depends on model
      supportsSystemPrompt: true,
      maxContextLength: 8192, // Varies by model
      models: [], // Dynamic based on what's installed
    };
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json() as { models: OllamaModel[] };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Create a completion
   */
  async complete(
    messages: Message[],
    options: CompletionOptions = {}
  ): Promise<CompletionResponse> {
    const model = options.model ?? this.config.defaultModel;

    const systemMessage = messages.find((m) => m.role === 'system');
    const systemPrompt = options.systemPrompt ?? systemMessage?.content;

    const ollamaMessages = toOllamaMessages(messages, systemPrompt);

    const request: OllamaChatRequest = {
      model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
        stop: options.stopSequences,
      },
    };

    if (options.tools && options.tools.length > 0) {
      request.tools = toOllamaTools(options.tools);
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as OllamaChatResponse;

      // Extract tool calls if present
      const toolCalls: ToolCall[] = [];
      if (data.message.tool_calls) {
        for (let i = 0; i < data.message.tool_calls.length; i++) {
          const tc = data.message.tool_calls[i];
          if (tc) {
            toolCalls.push({
              id: `call_${i}`,
              name: tc.function.name,
              arguments: tc.function.arguments,
            });
          }
        }
      }

      const hasToolCalls = toolCalls.length > 0;

      return {
        content: data.message.content,
        role: 'assistant',
        finishReason: hasToolCalls ? 'tool_calls' : 'stop',
        toolCalls: hasToolCalls ? toolCalls : undefined,
        usage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
        model: data.model,
        raw: data,
      };
    } catch (error) {
      log.error('Ollama completion failed', error);
      throw error;
    }
  }

  /**
   * Create a streaming completion
   */
  async *stream(
    messages: Message[],
    options: CompletionOptions = {}
  ): AsyncIterable<StreamChunk> {
    const model = options.model ?? this.config.defaultModel;

    const systemMessage = messages.find((m) => m.role === 'system');
    const systemPrompt = options.systemPrompt ?? systemMessage?.content;

    const ollamaMessages = toOllamaMessages(messages, systemPrompt);

    const request: OllamaChatRequest = {
      model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
        stop: options.stopSequences,
      },
    };

    if (options.tools && options.tools.length > 0) {
      request.tools = toOllamaTools(options.tools);
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          yield { type: 'done' };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line) as OllamaChatResponse;

            if (data.message?.content) {
              yield { type: 'content', content: data.message.content };
            }

            if (data.done) {
              if (data.prompt_eval_count !== undefined || data.eval_count !== undefined) {
                yield {
                  type: 'usage',
                  usage: {
                    promptTokens: data.prompt_eval_count ?? 0,
                    completionTokens: data.eval_count ?? 0,
                    totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
                  },
                };
              }
              yield { type: 'done' };
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      log.error('Ollama stream failed', error);
      throw error;
    }
  }

  /**
   * Count tokens in messages (rough estimate)
   */
  async countTokens(messages: Message[]): Promise<number> {
    // Rough estimate: ~4 chars per token
    let charCount = 0;
    for (const message of messages) {
      charCount += message.content.length;
    }
    return Math.ceil(charCount / 4);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.status}`);
    }

    // Stream the response to completion
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    log.info('Model pulled', { model: modelName });
  }
}

/**
 * Create an Ollama provider instance
 */
export function createOllamaProvider(config?: OllamaConfig): OllamaProvider {
  return new OllamaProvider(config);
}
