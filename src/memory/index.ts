/**
 * Memory System Module
 * Provides vector database, embeddings, and semantic search
 */

export * from './types.js';
export * from './embeddings.js';
export * from './database.js';
export * from './search.js';
export * from './indexer.js';

import { createLogger } from '../logging/logger.js';
import { SQLiteMemoryStore } from './database.js';
import {
  createEmbeddingProvider,
  CachedEmbeddingProvider,
} from './embeddings.js';
import { SemanticSearch } from './search.js';
import { DefaultMemoryIndexer } from './indexer.js';
import type {
  MemoryConfig,
  EmbeddingProvider,
  MemoryIndexer,
  MemoryStore,
} from './types.js';
import { DEFAULT_MEMORY_CONFIG } from './types.js';

const log = createLogger('memory');

/**
 * Memory System - Main facade for the memory module
 */
export class MemorySystem {
  private store: SQLiteMemoryStore;
  private embeddingProvider: EmbeddingProvider;
  private search: SemanticSearch;
  private indexer: MemoryIndexer;
  private config: MemoryConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };

    // Create store
    this.store = new SQLiteMemoryStore(
      this.config.databasePath,
      this.getEmbeddingDimensions()
    );

    // Create embedding provider
    const baseProvider = createEmbeddingProvider(
      this.config.embeddingProvider,
      this.config.embeddingModel ? { model: this.config.embeddingModel } : undefined
    );

    // Wrap with cache if enabled
    this.embeddingProvider = this.config.cacheEmbeddings
      ? new CachedEmbeddingProvider(baseProvider)
      : baseProvider;

    // Create search and indexer
    this.search = new SemanticSearch(this.store, this.embeddingProvider);
    this.indexer = new DefaultMemoryIndexer(this.store, this.embeddingProvider);
  }

  /**
   * Initialize the memory system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('Initializing memory system', { config: this.config });

    // Initialize store
    await this.store.initialize();

    // Check embedding provider
    const available = await this.embeddingProvider.isAvailable();
    if (!available) {
      log.warn('Embedding provider not available, some features may be limited');
    }

    this.initialized = true;
    log.info('Memory system initialized');
  }

  /**
   * Close the memory system
   */
  async close(): Promise<void> {
    await this.store.close();
    this.initialized = false;
    log.info('Memory system closed');
  }

  /**
   * Get the memory store
   */
  getStore(): MemoryStore {
    return this.store;
  }

  /**
   * Get the embedding provider
   */
  getEmbeddingProvider(): EmbeddingProvider {
    return this.embeddingProvider;
  }

  /**
   * Get the semantic search engine
   */
  getSearch(): SemanticSearch {
    return this.search;
  }

  /**
   * Get the memory indexer
   */
  getIndexer(): MemoryIndexer {
    return this.indexer;
  }

  /**
   * Search for documents
   */
  async search_documents(
    query: string,
    options?: {
      mode?: 'vector' | 'fulltext' | 'hybrid';
      limit?: number;
      types?: Array<'conversation' | 'code' | 'markdown' | 'text' | 'json'>;
      sessionId?: string;
    }
  ) {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.search.search({
      query,
      mode: options?.mode ?? 'hybrid',
      limit: options?.limit ?? 10,
      types: options?.types,
      sessionId: options?.sessionId,
      offset: 0,
      threshold: 0.5,
    });
  }

  /**
   * Index a conversation message
   */
  async indexConversation(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.indexer.indexConversation(sessionId, role, content, metadata);
  }

  /**
   * Index a code file
   */
  async indexCodeFile(filePath: string, content: string, language?: string): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.indexer.indexCodeFile(filePath, content, language);
  }

  /**
   * Index a markdown document
   */
  async indexMarkdown(filePath: string, content: string): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.indexer.indexMarkdown(filePath, content);
  }

  /**
   * Index plain text
   */
  async indexText(content: string, metadata?: Record<string, unknown>): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.indexer.indexText(content, { custom: metadata ?? {}, tags: [] });
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    embeddingCount: number;
    databaseSize: number;
    embeddingProvider: string;
    embeddingDimensions: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const dbStats = await this.store.getStats();

    return {
      ...dbStats,
      embeddingProvider: this.embeddingProvider.type,
      embeddingDimensions: this.embeddingProvider.getDimensions(),
    };
  }

  /**
   * Clear all memory
   */
  async clear(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.store.clear();
    log.info('Memory cleared');
  }

  /**
   * Get embedding dimensions based on provider
   */
  private getEmbeddingDimensions(): number {
    switch (this.config.embeddingProvider) {
      case 'openai':
        return this.config.embeddingModel?.includes('large') ? 3072 : 1536;
      case 'ollama':
        return 768; // Default for nomic-embed-text
      case 'local':
        return 384;
      default:
        return 1536;
    }
  }
}

/**
 * Create a memory system with default configuration
 */
export function createMemorySystem(config?: Partial<MemoryConfig>): MemorySystem {
  return new MemorySystem(config);
}

/**
 * Create memory tools for agent integration
 */
export function createMemoryTools(memorySystem: MemorySystem) {
  return [
    {
      definition: {
        name: 'memory_search',
        description: 'Search through stored memories and documents using semantic search',
        parameters: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5)',
            },
            type: {
              type: 'string',
              description: 'Filter by document type (conversation, code, markdown, text)',
              enum: ['conversation', 'code', 'markdown', 'text', 'json'],
            },
          },
          required: ['query'],
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const query = args.query as string;
        const limit = (args.limit as number) ?? 5;
        const type = args.type as string | undefined;

        try {
          const results = await memorySystem.search_documents(query, {
            limit,
            types: type ? [type as 'conversation' | 'code' | 'markdown' | 'text' | 'json'] : undefined,
          });

          const formatted = results.results.map((r, i) =>
            `${i + 1}. [${r.document.type}] (score: ${r.score.toFixed(2)})\n${r.document.content.slice(0, 200)}...`
          ).join('\n\n');

          return {
            success: true,
            content: `Found ${results.totalResults} results:\n\n${formatted}`,
            data: results,
          };
        } catch (error) {
          return {
            success: false,
            content: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      definition: {
        name: 'memory_store',
        description: 'Store information in long-term memory',
        parameters: {
          type: 'object' as const,
          properties: {
            content: {
              type: 'string',
              description: 'The content to store',
            },
            type: {
              type: 'string',
              description: 'The type of content',
              enum: ['text', 'code', 'markdown'],
            },
            tags: {
              type: 'array',
              description: 'Tags to categorize the memory',
              items: { type: 'string' },
            },
          },
          required: ['content'],
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const content = args.content as string;
        const tags = (args.tags as string[]) ?? [];

        try {
          const id = await memorySystem.indexText(content, { tags });

          return {
            success: true,
            content: `Stored in memory with ID: ${id}`,
            data: { id },
          };
        } catch (error) {
          return {
            success: false,
            content: `Failed to store: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      definition: {
        name: 'memory_stats',
        description: 'Get statistics about the memory system',
        parameters: {
          type: 'object' as const,
          properties: {},
        },
      },
      handler: async () => {
        try {
          const stats = await memorySystem.getStats();

          return {
            success: true,
            content: `Memory Stats:\n- Documents: ${stats.documentCount}\n- Embeddings: ${stats.embeddingCount}\n- Database Size: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB\n- Provider: ${stats.embeddingProvider}\n- Dimensions: ${stats.embeddingDimensions}`,
            data: stats,
          };
        } catch (error) {
          return {
            success: false,
            content: `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}
