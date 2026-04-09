/**
 * Anthropic AI Provider implementation
 */

import Anthropic from '@anthropic-ai/sdk';
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
  AnthropicConfig,
} from './types.js';

const log = createLogger('anthropic');

/**
 * Map our message format to Anthropic format
 */
function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const content: Anthropic.ContentBlockParam[] = [];

      // Add text content
      if (m.content) {
        content.push({ type: 'text', text: m.content });
      }

      // Add tool results if present
      if (m.toolResults) {
        for (const result of m.toolResults) {
          content.push({
            type: 'tool_result',
            tool_use_id: result.toolCallId,
            content: result.content,
            is_error: result.isError,
          });
        }
      }

      // Add tool use if this is an assistant message with tool calls
      if (m.role === 'assistant' && m.toolCalls) {
        for (const call of m.toolCalls) {
          content.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.arguments,
          });
        }
      }

      return {
        role: m.role as 'user' | 'assistant',
        content: content.length > 0 ? content : m.content,
      };
    });
}

/**
 * Map tool definitions to Anthropic format
 */
function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  }));
}

/**
 * Anthropic AI Provider
 */
export class AnthropicProvider implements AIProvider {
  readonly type = 'anthropic' as const;

  private client: Anthropic;
  private config: AnthropicConfig;

  constructor(config: Partial<AnthropicConfig> = {}) {
    this.config = {
      defaultModel: config.defaultModel ?? 'claude-sonnet-4-20250514',
      maxRetries: config.maxRetries ?? 3,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'],
      baseURL: this.config.baseUrl,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      supportsSystemPrompt: true,
      maxContextLength: 200000,
      models: [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ],
    };
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const key = this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
      return !!key;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    return this.getCapabilities().models;
  }

  /**
   * Create a completion
   */
  async complete(
    messages: Message[],
    options: CompletionOptions = {}
  ): Promise<CompletionResponse> {
    const model = options.model ?? this.config.defaultModel;
    const maxTokens = options.maxTokens ?? 4096;

    // Extract system prompt from messages or options
    const systemMessage = messages.find((m) => m.role === 'system');
    const systemPrompt = options.systemPrompt ?? systemMessage?.content;

    const anthropicMessages = toAnthropicMessages(messages);

    try {
      const params: Anthropic.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        temperature: options.temperature,
        stop_sequences: options.stopSequences,
      };

      if (systemPrompt) {
        params.system = systemPrompt;
      }

      if (options.tools && options.tools.length > 0) {
        params.tools = toAnthropicTools(options.tools);
      }

      const response = await this.client.messages.create(params);

      // Extract content and tool calls
      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      const finishReason = response.stop_reason === 'tool_use' ? 'tool_calls' :
                          response.stop_reason === 'max_tokens' ? 'length' :
                          response.stop_reason === 'end_turn' ? 'stop' : 'stop';

      return {
        content,
        role: 'assistant',
        finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        raw: response,
      };
    } catch (error) {
      log.error('Anthropic completion failed', error);
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
    const maxTokens = options.maxTokens ?? 4096;

    const systemMessage = messages.find((m) => m.role === 'system');
    const systemPrompt = options.systemPrompt ?? systemMessage?.content;

    const anthropicMessages = toAnthropicMessages(messages);

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      temperature: options.temperature,
      stop_sequences: options.stopSequences,
      stream: true,
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    if (options.tools && options.tools.length > 0) {
      params.tools = toAnthropicTools(options.tools);
    }

    try {
      const stream = await this.client.messages.create(params);

      let currentToolCall: Partial<ToolCall> | null = null;

      for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'content', content: delta.text };
          } else if ('partial_json' in delta && currentToolCall) {
            // Accumulate tool call JSON
            yield {
              type: 'tool_call',
              toolCall: currentToolCall,
            };
          }
        } else if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            currentToolCall = {
              id: block.id,
              name: block.name,
              arguments: {},
            };
          }
        } else if (event.type === 'content_block_stop') {
          currentToolCall = null;
        } else if (event.type === 'message_delta') {
          if ('usage' in event && event.usage) {
            yield {
              type: 'usage',
              usage: {
                promptTokens: 0,
                completionTokens: event.usage.output_tokens,
                totalTokens: event.usage.output_tokens,
              },
            };
          }
        } else if (event.type === 'message_stop') {
          yield { type: 'done' };
        }
      }
    } catch (error) {
      log.error('Anthropic stream failed', error);
      throw error;
    }
  }

  /**
   * Count tokens in messages (approximate)
   */
  async countTokens(messages: Message[]): Promise<number> {
    // Anthropic doesn't have a public tokenizer API
    // Use rough estimate: ~4 chars per token
    let charCount = 0;
    for (const message of messages) {
      charCount += message.content.length;
    }
    return Math.ceil(charCount / 4);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AnthropicConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.apiKey || config.baseUrl) {
      this.client = new Anthropic({
        apiKey: this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'],
        baseURL: this.config.baseUrl,
        maxRetries: this.config.maxRetries,
      });
    }
  }
}

/**
 * Create an Anthropic provider instance
 */
export function createAnthropicProvider(config?: AnthropicConfig): AnthropicProvider {
  return new AnthropicProvider(config);
}
