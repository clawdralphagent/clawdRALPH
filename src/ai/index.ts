/**
 * AI Provider and Agent module
 * Exports all AI-related components
 */

// Types
export type {
  AIProviderType,
  MessageRole,
  Message,
  ToolCall,
  ToolResult,
  ToolDefinition,
  CompletionOptions,
  TokenUsage,
  CompletionResponse,
  StreamChunk,
  ProviderCapabilities,
  ProviderStatus,
  AIProvider,
  ReasoningLevelValue,
  AnthropicConfig,
  OpenAIConfig,
  OllamaConfig,
  AIConfig,
} from './types.js';

export {
  ReasoningLevel,
  getReasoningBudget,
  AnthropicConfigSchema,
  OpenAIConfigSchema,
  OllamaConfigSchema,
  AIConfigSchema,
} from './types.js';

// Providers
export { AnthropicProvider, createAnthropicProvider } from './anthropic.js';
export { OpenAIProvider, createOpenAIProvider } from './openai.js';
export { OllamaProvider, createOllamaProvider } from './ollama.js';

// Tools
export type {
  ToolHandler,
  ToolContext,
  ToolExecutionResult,
  RegisteredTool,
} from './tools.js';

export {
  ToolRegistry,
  createDefaultTools,
  createToolRegistry,
} from './tools.js';

// Agent
export type {
  Conversation,
  AgentConfig,
  AgentResponse,
  AgentStreamChunk,
} from './agent.js';

export {
  Agent,
  createAgent,
  getGlobalAgent,
  setGlobalAgent,
} from './agent.js';
