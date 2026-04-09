/**
 * Tests for Embedding Providers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  LocalEmbeddingProvider,
  EmbeddingCache,
  CachedEmbeddingProvider,
  createEmbeddingProvider,
} from './embeddings.js';

describe('LocalEmbeddingProvider', () => {
  let provider: LocalEmbeddingProvider;

  beforeEach(() => {
    provider = new LocalEmbeddingProvider(384);
  });

  it('should return correct model name', () => {
    expect(provider.getModel()).toBe('local-hash');
  });

  it('should return correct dimensions', () => {
    expect(provider.getDimensions()).toBe(384);
  });

  it('should always be available', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should generate embeddings for empty array', async () => {
    const result = await provider.embed([]);
    expect(result.embeddings).toHaveLength(0);
    expect(result.model).toBe('local-hash');
    expect(result.dimensions).toBe(384);
  });

  it('should generate embeddings for single text', async () => {
    const result = await provider.embed(['hello world']);
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(384);
  });

  it('should generate embeddings for multiple texts', async () => {
    const result = await provider.embed(['hello', 'world', 'test']);
    expect(result.embeddings).toHaveLength(3);
    result.embeddings.forEach((emb) => {
      expect(emb).toHaveLength(384);
    });
  });

  it('should generate deterministic embeddings', async () => {
    const result1 = await provider.embedOne('same text');
    const result2 = await provider.embedOne('same text');
    expect(result1).toEqual(result2);
  });

  it('should generate different embeddings for different texts', async () => {
    const result1 = await provider.embedOne('text one');
    const result2 = await provider.embedOne('text two');
    expect(result1).not.toEqual(result2);
  });

  it('should normalize vectors', async () => {
    const embedding = await provider.embedOne('test text');
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    // Should be close to 1 (normalized) or 0 (zero vector)
    expect(magnitude).toBeLessThanOrEqual(1.01);
  });
});

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(100, 3600000);
  });

  it('should return null for uncached items', () => {
    expect(cache.get('unknown text', 'model')).toBeNull();
  });

  it('should store and retrieve embeddings', () => {
    const embedding = [0.1, 0.2, 0.3];
    cache.set('test text', 'model', embedding);
    expect(cache.get('test text', 'model')).toEqual(embedding);
  });

  it('should differentiate by model', () => {
    const embedding1 = [0.1, 0.2];
    const embedding2 = [0.3, 0.4];
    cache.set('text', 'model1', embedding1);
    cache.set('text', 'model2', embedding2);
    expect(cache.get('text', 'model1')).toEqual(embedding1);
    expect(cache.get('text', 'model2')).toEqual(embedding2);
  });

  it('should report correct stats', () => {
    cache.set('text1', 'model', [0.1]);
    cache.set('text2', 'model', [0.2]);
    const stats = cache.stats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(100);
  });

  it('should clear all entries', () => {
    cache.set('text1', 'model', [0.1]);
    cache.set('text2', 'model', [0.2]);
    cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.get('text1', 'model')).toBeNull();
  });

  it('should evict old entries when at capacity', () => {
    // Use a larger cache so the 10% eviction works
    const smallCache = new EmbeddingCache(100, 3600000);
    for (let i = 0; i < 150; i++) {
      smallCache.set(`text${i}`, 'model', [i]);
    }
    // Should have evicted some entries (10% each time it hit capacity)
    expect(smallCache.stats().size).toBeLessThanOrEqual(100);
  });

  it('should expire entries after TTL', async () => {
    const shortTTLCache = new EmbeddingCache(100, 10); // 10ms TTL
    shortTTLCache.set('text', 'model', [0.1]);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(shortTTLCache.get('text', 'model')).toBeNull();
  });
});

describe('CachedEmbeddingProvider', () => {
  let baseProvider: LocalEmbeddingProvider;
  let cachedProvider: CachedEmbeddingProvider;

  beforeEach(() => {
    baseProvider = new LocalEmbeddingProvider(384);
    cachedProvider = new CachedEmbeddingProvider(baseProvider);
  });

  it('should delegate model info to base provider', () => {
    expect(cachedProvider.getModel()).toBe(baseProvider.getModel());
    expect(cachedProvider.getDimensions()).toBe(baseProvider.getDimensions());
    expect(cachedProvider.type).toBe(baseProvider.type);
  });

  it('should cache embedOne results', async () => {
    const spy = vi.spyOn(baseProvider, 'embedOne');

    // First call should hit the base provider
    await cachedProvider.embedOne('test');
    expect(spy).toHaveBeenCalledTimes(1);

    // Second call should hit cache
    await cachedProvider.embedOne('test');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should cache embed results', async () => {
    const spy = vi.spyOn(baseProvider, 'embed');

    // First call
    await cachedProvider.embed(['text1', 'text2']);
    expect(spy).toHaveBeenCalledTimes(1);

    // Second call with same texts should hit cache
    await cachedProvider.embed(['text1', 'text2']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should only call base provider for uncached texts', async () => {
    const spy = vi.spyOn(baseProvider, 'embed');

    // Cache some texts
    await cachedProvider.embed(['text1', 'text2']);
    expect(spy).toHaveBeenCalledTimes(1);

    // Call with mix of cached and uncached
    await cachedProvider.embed(['text1', 'text3', 'text2']);
    expect(spy).toHaveBeenCalledTimes(2);

    // The second call should only have uncached text
    expect(spy).toHaveBeenLastCalledWith(['text3']);
  });

  it('should report cache stats', async () => {
    await cachedProvider.embedOne('text1');
    await cachedProvider.embedOne('text2');

    const stats = cachedProvider.getCacheStats();
    expect(stats.size).toBe(2);
  });

  it('should clear cache', async () => {
    await cachedProvider.embedOne('text1');
    cachedProvider.clearCache();
    expect(cachedProvider.getCacheStats().size).toBe(0);
  });
});

describe('createEmbeddingProvider', () => {
  it('should create local provider', () => {
    const provider = createEmbeddingProvider('local');
    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });

  it('should create local provider with custom dimensions', () => {
    const provider = createEmbeddingProvider('local', { dimensions: 512 });
    expect(provider.getDimensions()).toBe(512);
  });

  it('should create OpenAI provider', () => {
    const provider = createEmbeddingProvider('openai');
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  });

  it('should create Ollama provider', () => {
    const provider = createEmbeddingProvider('ollama');
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
  });

  it('should throw for unknown provider type', () => {
    expect(() => createEmbeddingProvider('unknown' as any)).toThrow('Unknown embedding provider');
  });
});

describe('OpenAIEmbeddingProvider', () => {
  let provider: OpenAIEmbeddingProvider;

  beforeEach(() => {
    provider = new OpenAIEmbeddingProvider({ apiKey: 'test-key' });
  });

  it('should return correct model name', () => {
    expect(provider.getModel()).toBe('text-embedding-3-small');
  });

  it('should return correct dimensions for small model', () => {
    expect(provider.getDimensions()).toBe(1536);
  });

  it('should return correct dimensions for large model', () => {
    const largeProvider = new OpenAIEmbeddingProvider({
      apiKey: 'test',
      model: 'text-embedding-3-large',
    });
    expect(largeProvider.getDimensions()).toBe(3072);
  });

  it('should return empty array for empty input', async () => {
    const result = await provider.embed([]);
    expect(result.embeddings).toHaveLength(0);
  });
});

describe('OllamaEmbeddingProvider', () => {
  let provider: OllamaEmbeddingProvider;

  beforeEach(() => {
    provider = new OllamaEmbeddingProvider();
  });

  it('should return correct model name', () => {
    expect(provider.getModel()).toBe('nomic-embed-text');
  });

  it('should return correct dimensions for nomic model', () => {
    expect(provider.getDimensions()).toBe(768);
  });

  it('should return correct dimensions for mxbai model', () => {
    const mxbaiProvider = new OllamaEmbeddingProvider({ model: 'mxbai-embed-large' });
    expect(mxbaiProvider.getDimensions()).toBe(1024);
  });

  it('should return correct dimensions for minilm model', () => {
    const minilmProvider = new OllamaEmbeddingProvider({ model: 'all-minilm' });
    expect(minilmProvider.getDimensions()).toBe(384);
  });

  it('should return empty array for empty input', async () => {
    const result = await provider.embed([]);
    expect(result.embeddings).toHaveLength(0);
  });
});
