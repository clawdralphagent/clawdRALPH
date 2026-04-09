/**
 * OpenAI AI Provider implementation
 */

import OpenAI from 'openai';
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
  OpenAIConfig,
} from './types.js';

const log = createLogger('openai');

/**
 * Map our message format to OpenAI format
 */
function toOpenAIMessages(
  messages: Message[],
  systemPrompt?: string
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  // Add system prompt first
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const m of messages) {
    if (m.role === 'system') {
      // Already handled
      if (!systemPrompt) {
        result.push({ role: 'system', content: m.content });
      }
    } else if (m.role === 'user') {
      // Check if this is a tool result
      if (m.toolResults && m.toolResults.length > 0) {
        for (const toolResult of m.toolResults) {
          // OpenAI expects tool messages separately
          result.push({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content: toolResult.content,
          } as OpenAI.ChatCompletionToolMessageParam);
        }
      } else {
        result.push({ role: 'user', content: m.content });
      }
    } else if (m.role === 'assistant') {
      const msg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: m.content || null,
      };

      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      result.push(msg);
    }
  }

  return result;
}

/**
 * Map tool definitions to OpenAI format
 */
function toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
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
 * OpenAI AI Provider
 */
export class OpenAIProvider implements AIProvider {
  readonly type = 'openai' as const;

  private client: OpenAI;
  private config: OpenAIConfig;

  constructor(config: Partial<OpenAIConfig> = {}) {
    this.config = {
      defaultModel: config.defaultModel ?? 'gpt-4o',
      maxRetries: config.maxRetries ?? 3,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      organization: config.organization,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey ?? process.env['OPENAI_API_KEY'],
      baseURL: this.config.baseUrl,
      organization: this.config.organization,
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
      maxContextLength: 128000,
      models: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'o1-preview',
        'o1-mini',
      ],
    };
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const key = this.config.apiKey ?? process.env['OPENAI_API_KEY'];
      return !!key;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      return response.data
        .filter((m) => m.id.includes('gpt') || m.id.includes('o1'))
        .map((m) => m.id);
    } catch {
      return this.getCapabilities().models;
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
    const maxTokens = options.maxTokens ?? 4096;

    const systemMessage = messages.find((m) => m.role === 'system');
    const systemPrompt = options.systemPrompt ?? systemMessage?.content;

    const openaiMessages = toOpenAIMessages(messages, systemPrompt);

    try {
      const params: OpenAI.ChatCompletionCreateParams = {
        model,
        messages: openaiMessages,
        max_tokens: maxTokens,
        temperature: options.temperature,
        stop: options.stopSequences,
      };

      if (options.tools && options.tools.length > 0) {
        params.tools = toOpenAITools(options.tools);
      }

      const response = await this.client.chat.completions.create(params);

      const choice = response.choices[0];
      const message = choice?.message;

      // Extract tool calls if present
      const toolCalls: ToolCall[] = [];
      if (message?.tool_calls) {
        for (const tc of message.tool_calls) {
          // Only process function tool calls
          if (tc.type === 'function' && 'function' in tc) {
            const funcCall = tc as { id: string; function: { name: string; arguments: string } };
            toolCalls.push({
              id: funcCall.id,
              name: funcCall.function.name,
              arguments: JSON.parse(funcCall.function.arguments || '{}'),
            });
          }
        }
      }

      const finishReason = choice?.finish_reason === 'tool_calls' ? 'tool_calls' :
                          choice?.finish_reason === 'length' ? 'length' :
                          choice?.finish_reason === 'content_filter' ? 'content_filter' :
                          'stop';

      return {
        content: message?.content ?? '',
        role: 'assistant',
        finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        model: response.model,
        raw: response,
      };
    } catch (error) {
      log.error('OpenAI completion failed', error);
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

    const openaiMessages = toOpenAIMessages(messages, systemPrompt);

    const params: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: openaiMessages,
      max_tokens: maxTokens,
      temperature: options.temperature,
      stop: options.stopSequences,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      params.tools = toOpenAITools(options.tools);
    }

    try {
      const stream = await this.client.chat.completions.create(params);

      const toolCalls: Map<number, Partial<ToolCall>> = new Map();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta;

        if (delta?.content) {
          yield { type: 'content', content: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls.has(tc.index)) {
              toolCalls.set(tc.index, {
                id: tc.id,
                name: tc.function?.name,
                arguments: {},
              });
            }

            const existing = toolCalls.get(tc.index)!;
            if (tc.function?.name) {
              existing.name = tc.function.name;
            }
            if (tc.function?.arguments) {
              // Accumulate arguments string
              const currentArgs = JSON.stringify(existing.arguments || {});
              try {
                existing.arguments = JSON.parse(
                  currentArgs.slice(0, -1) + tc.function.arguments
                );
              } catch {
                // Still accumulating
              }
            }

            yield { type: 'tool_call', toolCall: existing };
          }
        }

        if (choice?.finish_reason) {
          if (chunk.usage) {
            yield {
              type: 'usage',
              usage: {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              },
            };
          }
          yield { type: 'done' };
        }
      }
    } catch (error) {
      log.error('OpenAI stream failed', error);
      throw error;
    }
  }

  /**
   * Count tokens in messages (approximate)
   */
  async countTokens(messages: Message[]): Promise<number> {
    // OpenAI uses tiktoken, but for simplicity use rough estimate
    // ~4 chars per token for English text
    let charCount = 0;
    for (const message of messages) {
      charCount += message.content.length;
    }
    return Math.ceil(charCount / 4);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.apiKey || config.baseUrl || config.organization) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey ?? process.env['OPENAI_API_KEY'],
        baseURL: this.config.baseUrl,
        organization: this.config.organization,
        maxRetries: this.config.maxRetries,
      });
    }
  }
}

/**
 * Create an OpenAI provider instance
 */
export function createOpenAIProvider(config?: OpenAIConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
