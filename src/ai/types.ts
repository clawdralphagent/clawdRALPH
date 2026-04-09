/**
 * AI Provider type definitions
 */

import { z } from 'zod';

/**
 * Supported AI providers
 */
export type AIProviderType = 'anthropic' | 'openai' | 'ollama';

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Conversation message
 */
export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

/**
 * Tool call from the model
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result to send back
 */
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required?: string[];
  };
}

/**
 * Completion request options
 */
export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  stream?: boolean;
}

/**
 * Token usage info
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Completion response
 */
export interface CompletionResponse {
  content: string;
  role: MessageRole;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  model: string;
  raw?: unknown;
}

/**
 * Streaming chunk
 */
export interface StreamChunk {
  type: 'content' | 'tool_call' | 'usage' | 'done';
  content?: string;
  toolCall?: Partial<ToolCall>;
  usage?: TokenUsage;
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsSystemPrompt: boolean;
  maxContextLength: number;
  models: string[];
}

/**
 * Provider status
 */
export interface ProviderStatus {
  type: AIProviderType;
  available: boolean;
  error?: string;
  models: string[];
}

/**
 * AI Provider interface
 */
export interface AIProvider {
  /** Provider type */
  readonly type: AIProviderType;

  /** Get provider capabilities */
  getCapabilities(): ProviderCapabilities;

  /** Check if provider is available */
  isAvailable(): Promise<boolean>;

  /** List available models */
  listModels(): Promise<string[]>;

  /** Create a completion */
  complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResponse>;

  /** Create a streaming completion */
  stream(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk>;

  /** Count tokens in messages */
  countTokens(messages: Message[]): Promise<number>;
}

/**
 * Reasoning level configuration
 */
export const ReasoningLevel = {
  OFF: 'off',
  MINIMAL: 'minimal',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  XHIGH: 'xhigh',
} as const;

export type ReasoningLevelValue = typeof ReasoningLevel[keyof typeof ReasoningLevel];

/**
 * Map reasoning level to budget tokens for extended thinking
 */
export function getReasoningBudget(level: ReasoningLevelValue): number {
  switch (level) {
    case 'off': return 0;
    case 'minimal': return 1024;
    case 'low': return 4096;
    case 'medium': return 8192;
    case 'high': return 16384;
    case 'xhigh': return 32768;
    default: return 8192;
  }
}

/**
 * Provider configuration schemas
 */
export const AnthropicConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().default('claude-sonnet-4-20250514'),
  maxRetries: z.number().int().positive().default(3),
});

export const OpenAIConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  organization: z.string().optional(),
  defaultModel: z.string().default('gpt-4o'),
  maxRetries: z.number().int().positive().default(3),
});

export const OllamaConfigSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:11434'),
  defaultModel: z.string().default('llama3.2'),
});

export type AnthropicConfig = z.infer<typeof AnthropicConfigSchema>;
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type OllamaConfig = z.infer<typeof OllamaConfigSchema>;

/**
 * All AI provider configuration
 */
export const AIConfigSchema = z.object({
  anthropic: AnthropicConfigSchema.default({}),
  openai: OpenAIConfigSchema.default({}),
  ollama: OllamaConfigSchema.default({}),
  defaultProvider: z.enum(['anthropic', 'openai', 'ollama']).default('anthropic'),
  reasoning: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('medium'),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;
