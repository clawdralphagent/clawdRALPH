/**
 * AI Agent Runtime
 * Manages conversations, executes tool calls, and coordinates with providers
 */

import { createLogger } from '../logging/logger.js';
import type {
  AIProvider,
  Message,
  CompletionOptions,
  CompletionResponse,
  ToolCall,
  AIProviderType,
} from './types.js';
import { ToolRegistry, ToolContext, createToolRegistry } from './tools.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

const log = createLogger('agent');

/**
 * Conversation state
 */
export interface Conversation {
  id: string;
  messages: Message[];
  systemPrompt?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Default provider to use */
  defaultProvider: AIProviderType;
  /** Default model for completions */
  defaultModel?: string;
  /** System prompt for all conversations */
  systemPrompt?: string;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Temperature for responses */
  temperature?: number;
  /** Maximum tool execution iterations */
  maxToolIterations?: number;
  /** Whether to enable streaming */
  streaming?: boolean;
}

/**
 * Agent response
 */
export interface AgentResponse {
  content: string;
  toolsUsed: string[];
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
  provider: AIProviderType;
}

/**
 * Streaming agent response chunk
 */
export interface AgentStreamChunk {
  type: 'content' | 'tool_start' | 'tool_end' | 'done';
  content?: string;
  toolName?: string;
  toolResult?: string;
}

/**
 * AI Agent runtime
 */
export class Agent {
  private providers: Map<AIProviderType, AIProvider> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private toolRegistry: ToolRegistry;
  private config: AgentConfig;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = {
      defaultProvider: config.defaultProvider ?? 'anthropic',
      defaultModel: config.defaultModel,
      systemPrompt: config.systemPrompt,
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      maxToolIterations: config.maxToolIterations ?? 10,
      streaming: config.streaming ?? true,
    };

    this.toolRegistry = createToolRegistry();

    // Initialize default providers
    this.initializeProviders();
  }

  /**
   * Initialize AI providers
   */
  private initializeProviders(): void {
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('ollama', new OllamaProvider());
  }

  /**
   * Get a provider by type
   */
  getProvider(type?: AIProviderType): AIProvider {
    const providerType = type ?? this.config.defaultProvider;
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Provider not found: ${providerType}`);
    }

    return provider;
  }

  /**
   * Set the default provider
   */
  setDefaultProvider(type: AIProviderType): void {
    if (!this.providers.has(type)) {
      throw new Error(`Provider not found: ${type}`);
    }
    this.config.defaultProvider = type;
    log.info('Default provider changed', { provider: type });
  }

  /**
   * Get the tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Create a new conversation
   */
  createConversation(
    id?: string,
    systemPrompt?: string
  ): Conversation {
    const conversationId = id ?? crypto.randomUUID();

    const conversation: Conversation = {
      id: conversationId,
      messages: [],
      systemPrompt: systemPrompt ?? this.config.systemPrompt,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.conversations.set(conversationId, conversation);
    log.debug('Conversation created', { id: conversationId });

    return conversation;
  }

  /**
   * Get a conversation by ID
   */
  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  /**
   * Delete a conversation
   */
  deleteConversation(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) {
      log.debug('Conversation deleted', { id });
    }
    return deleted;
  }

  /**
   * Add a message to a conversation
   */
  addMessage(conversationId: string, message: Message): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.messages.push(message);
    conversation.updatedAt = new Date();
  }

  /**
   * Send a message and get a response
   */
  async chat(
    conversationId: string,
    userMessage: string,
    options: Partial<CompletionOptions> = {}
  ): Promise<AgentResponse> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: userMessage,
    });
    conversation.updatedAt = new Date();

    const provider = this.getProvider();
    const toolsUsed: string[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const completionOptions: CompletionOptions = {
      model: options.model ?? this.config.defaultModel,
      maxTokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
      systemPrompt: conversation.systemPrompt,
      tools: this.toolRegistry.getDefinitions(),
      ...options,
    };

    let response: CompletionResponse;
    let iterations = 0;

    // Tool execution loop
    while (iterations < (this.config.maxToolIterations ?? 10)) {
      iterations++;

      response = await provider.complete(
        conversation.messages,
        completionOptions
      );

      if (response.usage) {
        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;
      }

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Add assistant response to conversation
        conversation.messages.push({
          role: 'assistant',
          content: response.content,
        });
        conversation.updatedAt = new Date();

        return {
          content: response.content,
          toolsUsed,
          tokenUsage: {
            prompt: totalPromptTokens,
            completion: totalCompletionTokens,
            total: totalPromptTokens + totalCompletionTokens,
          },
          model: response.model,
          provider: provider.type,
        };
      }

      // Execute tool calls
      const toolContext: ToolContext = {
        conversationId,
        metadata: conversation.metadata,
      };

      const toolResults = await this.toolRegistry.executeAll(
        response.toolCalls,
        toolContext
      );

      // Track tools used
      for (const tc of response.toolCalls) {
        toolsUsed.push(tc.name);
      }

      // Add assistant message with tool calls
      conversation.messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // Add tool results as user message
      conversation.messages.push({
        role: 'user',
        content: '',
        toolResults,
      });

      conversation.updatedAt = new Date();

      log.debug('Tool calls executed', {
        conversationId,
        tools: response.toolCalls.map((tc) => tc.name),
        iteration: iterations,
      });
    }

    // Max iterations reached
    log.warn('Max tool iterations reached', { conversationId, iterations });

    return {
      content: 'I apologize, but I reached the maximum number of tool calls. Please try again with a simpler request.',
      toolsUsed,
      tokenUsage: {
        prompt: totalPromptTokens,
        completion: totalCompletionTokens,
        total: totalPromptTokens + totalCompletionTokens,
      },
      model: response!.model,
      provider: provider.type,
    };
  }

  /**
   * Stream a response
   */
  async *streamChat(
    conversationId: string,
    userMessage: string,
    options: Partial<CompletionOptions> = {}
  ): AsyncIterable<AgentStreamChunk> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: userMessage,
    });
    conversation.updatedAt = new Date();

    const provider = this.getProvider();

    const completionOptions: CompletionOptions = {
      model: options.model ?? this.config.defaultModel,
      maxTokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
      systemPrompt: conversation.systemPrompt,
      tools: this.toolRegistry.getDefinitions(),
      ...options,
    };

    let fullContent = '';
    const pendingToolCalls: ToolCall[] = [];
    let iterations = 0;

    while (iterations < (this.config.maxToolIterations ?? 10)) {
      iterations++;
      fullContent = '';

      for await (const chunk of provider.stream(conversation.messages, completionOptions)) {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
          yield { type: 'content', content: chunk.content };
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          // Accumulate tool calls
          const existing = pendingToolCalls.find((tc) => tc.id === chunk.toolCall?.id);
          if (!existing && chunk.toolCall.id && chunk.toolCall.name) {
            pendingToolCalls.push({
              id: chunk.toolCall.id,
              name: chunk.toolCall.name,
              arguments: chunk.toolCall.arguments ?? {},
            });
          }
        } else if (chunk.type === 'done') {
          break;
        }
      }

      // If no tool calls, we're done
      if (pendingToolCalls.length === 0) {
        conversation.messages.push({
          role: 'assistant',
          content: fullContent,
        });
        conversation.updatedAt = new Date();

        yield { type: 'done' };
        return;
      }

      // Execute tool calls
      const toolContext: ToolContext = {
        conversationId,
        metadata: conversation.metadata,
      };

      for (const toolCall of pendingToolCalls) {
        yield { type: 'tool_start', toolName: toolCall.name };

        const result = await this.toolRegistry.execute(toolCall, toolContext);

        yield {
          type: 'tool_end',
          toolName: toolCall.name,
          toolResult: result.content,
        };
      }

      // Add messages
      conversation.messages.push({
        role: 'assistant',
        content: fullContent,
        toolCalls: [...pendingToolCalls],
      });

      const toolResults = await this.toolRegistry.executeAll(
        pendingToolCalls,
        toolContext
      );

      conversation.messages.push({
        role: 'user',
        content: '',
        toolResults,
      });

      conversation.updatedAt = new Date();
      pendingToolCalls.length = 0;
    }

    yield { type: 'done' };
  }

  /**
   * Simple one-shot completion without conversation
   */
  async complete(
    prompt: string,
    options: Partial<CompletionOptions> = {}
  ): Promise<string> {
    const provider = this.getProvider();

    const response = await provider.complete(
      [{ role: 'user', content: prompt }],
      {
        model: options.model ?? this.config.defaultModel,
        maxTokens: options.maxTokens ?? this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        systemPrompt: options.systemPrompt ?? this.config.systemPrompt,
        ...options,
      }
    );

    return response.content;
  }

  /**
   * Get all available providers and their status
   */
  async getProviderStatus(): Promise<
    Array<{
      type: AIProviderType;
      available: boolean;
      models: string[];
    }>
  > {
    const status = [];

    for (const [type, provider] of this.providers) {
      const available = await provider.isAvailable();
      const models = available ? await provider.listModels() : [];

      status.push({
        type,
        available,
        models,
      });
    }

    return status;
  }

  /**
   * List all conversations
   */
  listConversations(): Array<{
    id: string;
    messageCount: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    return Array.from(this.conversations.values()).map((c) => ({
      id: c.id,
      messageCount: c.messages.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Clear all conversations
   */
  clearConversations(): void {
    this.conversations.clear();
    log.debug('All conversations cleared');
  }

  /**
   * Export a conversation
   */
  exportConversation(id: string): Conversation | undefined {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;

    // Return a deep copy
    return JSON.parse(JSON.stringify(conversation));
  }

  /**
   * Import a conversation
   */
  importConversation(conversation: Conversation): void {
    // Restore dates from serialization
    conversation.createdAt = new Date(conversation.createdAt);
    conversation.updatedAt = new Date(conversation.updatedAt);

    this.conversations.set(conversation.id, conversation);
    log.debug('Conversation imported', { id: conversation.id });
  }
}

/**
 * Create an agent instance
 */
export function createAgent(config?: Partial<AgentConfig>): Agent {
  return new Agent(config);
}

/**
 * Global agent singleton (optional convenience)
 */
let globalAgent: Agent | null = null;

export function getGlobalAgent(): Agent {
  if (!globalAgent) {
    globalAgent = createAgent();
  }
  return globalAgent;
}

export function setGlobalAgent(agent: Agent): void {
  globalAgent = agent;
}
