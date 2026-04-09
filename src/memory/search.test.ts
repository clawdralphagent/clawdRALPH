/**
 * Tests for Semantic Search Module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TextChunker, SearchReranker, QueryExpander } from './search.js';
import type { SearchResponse, MemoryDocument } from './types.js';

describe('TextChunker', () => {
  let chunker: TextChunker;

  beforeEach(() => {
    chunker = new TextChunker();
  });

  describe('chunk', () => {
    it('should return single chunk for small text', () => {
      const text = 'This is a small piece of text.';
      const chunks = chunker.chunk(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.content).toBe(text);
    });

    it('should split large text into multiple chunks', () => {
      const text = 'a'.repeat(3000);
      const chunks = chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should use custom chunk size', () => {
      const text = 'a'.repeat(500);
      const chunks = chunker.chunk(text, { chunkSize: 100 });
      expect(chunks.length).toBeGreaterThan(4);
    });
  });

  describe('chunkCode', () => {
    it('should split TypeScript code into semantic chunks', () => {
      const code = `
export function hello() {
  console.log('hello');
}

export function world() {
  console.log('world');
}
`;
      const chunks = chunker.chunkCode(code, 'typescript');
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty code', () => {
      const chunks = chunker.chunkCode('', 'typescript');
      expect(chunks).toHaveLength(0);
    });
  });

  describe('chunkByLines', () => {
    it('should chunk text by lines', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');
      const chunks = chunker.chunkByLines(lines, 20, 5);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should handle single line', () => {
      const chunks = chunker.chunkByLines('single line');
      expect(chunks).toHaveLength(1);
    });
  });

  describe('chunkMarkdown', () => {
    it('should split markdown by headers', () => {
      const markdown = `
# Header 1
Content for header 1.

## Header 2
Content for header 2.
`;
      const chunks = chunker.chunkMarkdown(markdown);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('should include header metadata', () => {
      const markdown = `
# Main Title
Some content here.
`;
      const chunks = chunker.chunkMarkdown(markdown);
      if (chunks[0]) {
        expect(chunks[0].metadata?.headerLevel).toBe(1);
      }
    });
  });
});

describe('SearchReranker', () => {
  let reranker: SearchReranker;

  function createMockDocument(content: string, type: string): MemoryDocument {
    return {
      id: `doc-${Math.random().toString(36).slice(2)}`,
      type: type as 'text',
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  beforeEach(() => {
    reranker = new SearchReranker();
  });

  it('should boost exact matches', () => {
    const results: SearchResponse = {
      results: [
        { document: createMockDocument('other content', 'text'), score: 0.8 },
        { document: createMockDocument('exact match query', 'text'), score: 0.7 },
      ],
      query: 'exact match query',
      mode: 'vector',
      totalResults: 2,
      took: 10,
    };

    const reranked = reranker.rerank(results, 'exact match query', { exactMatchBoost: 0.3 });
    expect(reranked.results[0]?.document.content).toBe('exact match query');
  });

  it('should clamp scores to [0, 1]', () => {
    const results: SearchResponse = {
      results: [{ document: createMockDocument('content', 'text'), score: 0.95 }],
      query: 'content',
      mode: 'vector',
      totalResults: 1,
      took: 10,
    };

    const reranked = reranker.rerank(results, 'content', {
      exactMatchBoost: 0.5,
      recencyBoost: 0.5,
    });

    expect(reranked.results[0]?.score).toBeLessThanOrEqual(1);
    expect(reranked.results[0]?.score).toBeGreaterThanOrEqual(0);
  });
});

describe('QueryExpander', () => {
  let expander: QueryExpander;

  beforeEach(() => {
    expander = new QueryExpander();
  });

  it('should return original query', () => {
    const expansions = expander.expand('hello world');
    expect(expansions).toContain('hello world');
  });

  it('should expand programming synonyms', () => {
    const expansions = expander.expand('function');
    expect(expansions).toContain('function');
    expect(expansions.some((e) => e.includes('method'))).toBe(true);
  });

  it('should not duplicate expansions', () => {
    const expansions = expander.expand('function method');
    const unique = [...new Set(expansions)];
    expect(expansions.length).toBe(unique.length);
  });

  it('should handle unknown words', () => {
    const expansions = expander.expand('xyzzy foobar');
    expect(expansions).toHaveLength(1);
    expect(expansions[0]).toBe('xyzzy foobar');
  });
});
