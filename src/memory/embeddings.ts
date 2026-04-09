/**
 * Embedding Providers for Memory System
 * Supports OpenAI and Ollama embedding models
 */

import { createLogger } from '../logging/logger.js';
import type {
  EmbeddingProvider,
  EmbeddingProviderType,
  EmbeddingResponse,
} from './types.js';

const log = createLogger('embeddings');

/**
 * OpenAI Embedding Provider Configuration
 */
export interface OpenAIEmbeddingConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * OpenAI Embedding Provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly type: EmbeddingProviderType = 'openai';

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private dimensions: number;

  constructor(config: OpenAIEmbeddingConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.model = config.model ?? 'text-embedding-3-small';
    // text-embedding-3-small: 1536, text-embedding-3-large: 3072, text-embedding-ada-002: 1536
    this.dimensions = this.model.includes('large') ? 3072 : 1536;
  }

  getModel(): string {
    return this.model;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async embed(texts: string[]): Promise<EmbeddingResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (texts.length === 0) {
      return {
        embeddings: [],
        model: this.model,
        dimensions: this.dimensions,
      };
    }

    log.debug('Generating OpenAI embeddings', { count: texts.length, model: this.model });

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    // Sort by index to ensure correct order
    const sortedEmbeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    log.debug('OpenAI embeddings generated', {
      count: sortedEmbeddings.length,
      tokens: data.usage?.total_tokens,
    });

    return {
      embeddings: sortedEmbeddings,
      model: this.model,
      dimensions: this.dimensions,
      usage: data.usage ? { totalTokens: data.usage.total_tokens } : undefined,
    };
  }

  async embedOne(text: string): Promise<number[]> {
    const response = await this.embed([text]);
    if (response.embeddings.length === 0 || !response.embeddings[0]) {
      throw new Error('No embedding returned');
    }
    return response.embeddings[0];
  }
}

/**
 * Ollama Embedding Provider Configuration
 */
export interface OllamaEmbeddingConfig {
  baseUrl?: string;
  model?: string;
}

/**
 * Ollama Embedding Provider
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly type: EmbeddingProviderType = 'ollama';

  private baseUrl: string;
  private model: string;
  private dimensionsCache: number | null = null;

  constructor(config: OllamaEmbeddingConfig = {}) {
    this.baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = config.model ?? 'nomic-embed-text';
  }

  getModel(): string {
    return this.model;
  }

  getDimensions(): number {
    // Common embedding model dimensions
    // nomic-embed-text: 768, mxbai-embed-large: 1024, all-minilm: 384
    if (this.dimensionsCache) {
      return this.dimensionsCache;
    }

    if (this.model.includes('nomic')) return 768;
    if (this.model.includes('mxbai')) return 1024;
    if (this.model.includes('minilm')) return 384;
    return 768; // Default
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return false;

      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.some((m) => m.name.startsWith(this.model));
    } catch {
      return false;
    }
  }

  async embed(texts: string[]): Promise<EmbeddingResponse> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        model: this.model,
        dimensions: this.getDimensions(),
      };
    }

    log.debug('Generating Ollama embeddings', { count: texts.length, model: this.model });

    const embeddings: number[][] = [];

    // Ollama processes one at a time
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama embedding failed: ${error}`);
      }

      const data = await response.json() as { embedding: number[] };
      embeddings.push(data.embedding);

      // Cache dimensions from first response
      if (this.dimensionsCache === null && data.embedding.length > 0) {
        this.dimensionsCache = data.embedding.length;
      }
    }

    log.debug('Ollama embeddings generated', { count: embeddings.length });

    return {
      embeddings,
      model: this.model,
      dimensions: this.dimensionsCache ?? this.getDimensions(),
    };
  }

  async embedOne(text: string): Promise<number[]> {
    const response = await this.embed([text]);
    if (response.embeddings.length === 0 || !response.embeddings[0]) {
      throw new Error('No embedding returned');
    }
    return response.embeddings[0];
  }
}

/**
 * Local/Mock Embedding Provider for testing
 * Uses simple hash-based deterministic vectors
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly type: EmbeddingProviderType = 'local';

  private dimensions: number;

  constructor(dimensions: number = 384) {
    this.dimensions = dimensions;
  }

  getModel(): string {
    return 'local-hash';
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async embed(texts: string[]): Promise<EmbeddingResponse> {
    const embeddings = texts.map((text) => this.hashToVector(text));

    return {
      embeddings,
      model: 'local-hash',
      dimensions: this.dimensions,
    };
  }

  async embedOne(text: string): Promise<number[]> {
    return this.hashToVector(text);
  }

  /**
   * Convert text to a deterministic vector using simple hashing
   * This is NOT suitable for production semantic search, only for testing
   */
  private hashToVector(text: string): number[] {
    const vector: number[] = new Array(this.dimensions).fill(0) as number[];

    // Simple hash-based vector generation
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const idx = (charCode * (i + 1)) % this.dimensions;
      const current = vector[idx] ?? 0;
      vector[idx] = current + Math.sin(charCode * 0.1) * 0.1;
    }

    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        const current = vector[i] ?? 0;
        vector[i] = current / magnitude;
      }
    }

    return vector;
  }
}

/**
 * Create an embedding provider based on type
 */
export function createEmbeddingProvider(
  type: EmbeddingProviderType,
  config?: Record<string, unknown>
): EmbeddingProvider {
  switch (type) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config as OpenAIEmbeddingConfig);
    case 'ollama':
      return new OllamaEmbeddingProvider(config as OllamaEmbeddingConfig);
    case 'local':
      return new LocalEmbeddingProvider(config?.dimensions as number);
    default:
      throw new Error(`Unknown embedding provider: ${type}`);
  }
}

/**
 * Embedding cache for reducing API calls
 */
export class EmbeddingCache {
  private cache: Map<string, { embedding: number[]; timestamp: number }> = new Map();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 10000, ttlMs: number = 3600000) {
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  /**
   * Get cache key for text
   */
  private getKey(text: string, model: string): string {
    // Simple hash for cache key
    let hash = 0;
    const str = `${model}:${text}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Get cached embedding
   */
  get(text: string, model: string): number[] | null {
    const key = this.getKey(text, model);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.embedding;
  }

  /**
   * Set cached embedding
   */
  set(text: string, model: string, embedding: number[]): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.floor(this.maxSize * 0.1));

      for (const [key] of oldest) {
        this.cache.delete(key);
      }
    }

    const key = this.getKey(text, model);
    this.cache.set(key, { embedding, timestamp: Date.now() });
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Cached embedding provider wrapper
 */
export class CachedEmbeddingProvider implements EmbeddingProvider {
  readonly type: EmbeddingProviderType;

  private provider: EmbeddingProvider;
  private cache: EmbeddingCache;

  constructor(provider: EmbeddingProvider, cache?: EmbeddingCache) {
    this.provider = provider;
    this.type = provider.type;
    this.cache = cache ?? new EmbeddingCache();
  }

  getModel(): string {
    return this.provider.getModel();
  }

  getDimensions(): number {
    return this.provider.getDimensions();
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  async embed(texts: string[]): Promise<EmbeddingResponse> {
    const model = this.getModel();
    const results: Array<{ index: number; embedding: number[] | null }> = [];
    const uncached: Array<{ index: number; text: string }> = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const cached = this.cache.get(text, model);
      if (cached) {
        results.push({ index: i, embedding: cached });
      } else {
        uncached.push({ index: i, text });
        results.push({ index: i, embedding: null });
      }
    }

    // Generate embeddings for uncached texts
    if (uncached.length > 0) {
      const response = await this.provider.embed(uncached.map((u) => u.text));

      for (let i = 0; i < uncached.length; i++) {
        const uncachedItem = uncached[i]!;
        const embedding = response.embeddings[i];
        const resultItem = results[uncachedItem.index];
        if (resultItem && embedding) {
          resultItem.embedding = embedding;
          this.cache.set(uncachedItem.text, model, embedding);
        }
      }
    }

    return {
      embeddings: results.map((r) => r.embedding ?? []),
      model,
      dimensions: this.getDimensions(),
    };
  }

  async embedOne(text: string): Promise<number[]> {
    const model = this.getModel();
    const cached = this.cache.get(text, model);

    if (cached) {
      return cached;
    }

    const embedding = await this.provider.embedOne(text);
    this.cache.set(text, model, embedding);
    return embedding;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return this.cache.stats();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
