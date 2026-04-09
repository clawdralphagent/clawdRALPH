/**
 * Semantic Search Module
 * Provides hybrid search combining vector similarity and full-text search
 */

import { createLogger } from '../logging/logger.js';
import type {
  MemoryStore,
  EmbeddingProvider,
  SearchQuery,
  SearchResponse,
  TextChunk,
  ChunkingOptions,
} from './types.js';

const log = createLogger('search');

/**
 * Semantic Search Engine
 * Combines embedding-based vector search with full-text search
 */
export class SemanticSearch {
  private store: MemoryStore;
  private embeddingProvider: EmbeddingProvider;

  constructor(store: MemoryStore, embeddingProvider: EmbeddingProvider) {
    this.store = store;
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Search for similar documents
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    log.debug('Searching', { query: query.query, mode: query.mode });

    let queryEmbedding: number[] | undefined;

    // Generate query embedding for vector/hybrid search
    if (query.mode === 'vector' || query.mode === 'hybrid') {
      try {
        queryEmbedding = await this.embeddingProvider.embedOne(query.query);
      } catch (error) {
        log.warn('Failed to generate query embedding, falling back to fulltext', { error });
        // Fall back to fulltext if embedding fails
        if (query.mode === 'vector') {
          return {
            results: [],
            query: query.query,
            mode: 'fulltext',
            totalResults: 0,
            took: 0,
          };
        }
      }
    }

    return this.store.search(query, queryEmbedding);
  }

  /**
   * Find similar documents to a given document
   */
  async findSimilar(documentId: string, limit: number = 10): Promise<SearchResponse> {
    const document = await this.store.get(documentId);

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const embedding = await this.embeddingProvider.embedOne(document.content);

    return this.store.search(
      {
        query: document.content.slice(0, 100),
        mode: 'vector',
        limit,
        offset: 0,
        threshold: 0.5,
      },
      embedding
    );
  }

  /**
   * Get contextual documents for a conversation
   */
  async getContext(
    sessionId: string,
    currentMessage: string,
    limit: number = 5
  ): Promise<SearchResponse> {
    const embedding = await this.embeddingProvider.embedOne(currentMessage);

    return this.store.search(
      {
        query: currentMessage,
        mode: 'hybrid',
        limit,
        offset: 0,
        threshold: 0.6,
        sessionId,
      },
      embedding
    );
  }

  /**
   * Search across code files
   */
  async searchCode(query: string, limit: number = 10): Promise<SearchResponse> {
    const embedding = await this.embeddingProvider.embedOne(query);

    return this.store.search(
      {
        query,
        mode: 'hybrid',
        limit,
        offset: 0,
        threshold: 0.5,
        types: ['code'],
      },
      embedding
    );
  }
}

/**
 * Text Chunker for splitting documents
 */
export class TextChunker {
  private defaultOptions: ChunkingOptions = {
    chunkSize: 1000,
    chunkOverlap: 200,
  };

  /**
   * Split text into chunks
   */
  chunk(text: string, options?: Partial<ChunkingOptions>): TextChunk[] {
    const opts = { ...this.defaultOptions, ...options };
    const chunks: TextChunk[] = [];

    if (text.length <= opts.chunkSize) {
      return [{
        content: text,
        index: 0,
        startOffset: 0,
        endOffset: text.length,
      }];
    }

    let startOffset = 0;
    let index = 0;

    while (startOffset < text.length) {
      let endOffset = Math.min(startOffset + opts.chunkSize, text.length);

      // Try to break at sentence or paragraph boundary
      if (endOffset < text.length) {
        const searchStart = Math.max(startOffset + opts.chunkSize - 200, startOffset);
        const searchText = text.slice(searchStart, endOffset + 100);

        // Look for sentence boundary
        const sentenceMatch = searchText.match(/[.!?]\s+(?=[A-Z])/);
        if (sentenceMatch && sentenceMatch.index !== undefined) {
          endOffset = searchStart + sentenceMatch.index + 1;
        } else {
          // Look for paragraph boundary
          const paragraphMatch = searchText.match(/\n\n/);
          if (paragraphMatch && paragraphMatch.index !== undefined) {
            endOffset = searchStart + paragraphMatch.index + 2;
          }
        }
      }

      const content = text.slice(startOffset, endOffset).trim();

      if (content.length > 0) {
        chunks.push({
          content,
          index,
          startOffset,
          endOffset,
        });
        index++;
      }

      // Move start with overlap
      startOffset = endOffset - opts.chunkOverlap;

      // Avoid infinite loop
      if (startOffset >= text.length - 10) break;
    }

    return chunks;
  }

  /**
   * Split code into semantic chunks (functions, classes, etc.)
   */
  chunkCode(code: string, language?: string): TextChunk[] {
    const chunks: TextChunk[] = [];

    // Language-specific patterns for semantic boundaries
    const patterns: Record<string, RegExp> = {
      typescript: /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+\w+/gm,
      javascript: /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+\w+/gm,
      python: /^(?:async\s+)?(?:def|class)\s+\w+/gm,
      rust: /^(?:pub\s+)?(?:fn|struct|enum|impl|trait|mod)\s+\w+/gm,
      go: /^(?:func|type|var|const)\s+\w+/gm,
    };

    const pattern = language ? patterns[language.toLowerCase()] : null;

    if (pattern) {
      const matches = [...code.matchAll(pattern)];

      if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          if (!match || match.index === undefined) continue;

          const start = match.index;
          const nextMatch = matches[i + 1];
          const end = nextMatch?.index !== undefined ? nextMatch.index : code.length;

          const content = code.slice(start, end).trim();

          if (content.length > 0) {
            chunks.push({
              content,
              index: i,
              startOffset: start,
              endOffset: end,
              metadata: {
                type: match[0].split(/\s+/)[0] ?? 'unknown',
              },
            });
          }
        }

        return chunks;
      }
    }

    // Fall back to line-based chunking
    return this.chunkByLines(code, 50, 10);
  }

  /**
   * Split text by lines
   */
  chunkByLines(text: string, linesPerChunk: number = 50, overlapLines: number = 10): TextChunk[] {
    const lines = text.split('\n');
    const chunks: TextChunk[] = [];

    let index = 0;
    let lineStart = 0;

    while (lineStart < lines.length) {
      const lineEnd = Math.min(lineStart + linesPerChunk, lines.length);
      const chunkLines = lines.slice(lineStart, lineEnd);
      const content = chunkLines.join('\n').trim();

      if (content.length > 0) {
        // Calculate byte offsets
        const startOffset = lines.slice(0, lineStart).join('\n').length + (lineStart > 0 ? 1 : 0);
        const endOffset = startOffset + content.length;

        chunks.push({
          content,
          index,
          startOffset,
          endOffset,
          metadata: {
            lineStart,
            lineEnd,
          },
        });
        index++;
      }

      lineStart = lineEnd - overlapLines;

      // Avoid infinite loop
      if (lineStart >= lines.length - 1) break;
    }

    return chunks;
  }

  /**
   * Split markdown into sections
   */
  chunkMarkdown(markdown: string): TextChunk[] {
    const chunks: TextChunk[] = [];

    // Split by headers
    const headerPattern = /^(#{1,6})\s+(.+)$/gm;
    const matches = [...markdown.matchAll(headerPattern)];

    if (matches.length === 0) {
      // No headers, use regular chunking
      return this.chunk(markdown);
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (!match || match.index === undefined) continue;

      const start = match.index;
      const nextMatch = matches[i + 1];
      const end = nextMatch?.index !== undefined ? nextMatch.index : markdown.length;

      const content = markdown.slice(start, end).trim();
      const level = match[1]?.length ?? 1;
      const title = match[2] ?? '';

      if (content.length > 0) {
        // If section is too large, split it further
        if (content.length > 2000) {
          const subChunks = this.chunk(content, { chunkSize: 1000, chunkOverlap: 100 });
          for (const subChunk of subChunks) {
            chunks.push({
              content: subChunk.content,
              index: chunks.length,
              startOffset: start + subChunk.startOffset,
              endOffset: start + subChunk.endOffset,
              metadata: {
                headerLevel: level,
                headerTitle: title,
                subChunk: subChunk.index,
              },
            });
          }
        } else {
          chunks.push({
            content,
            index: chunks.length,
            startOffset: start,
            endOffset: end,
            metadata: {
              headerLevel: level,
              headerTitle: title,
            },
          });
        }
      }
    }

    return chunks;
  }
}

/**
 * Re-ranker for improving search results
 */
export class SearchReranker {
  /**
   * Re-rank results based on multiple signals
   */
  rerank(
    results: SearchResponse,
    query: string,
    options?: {
      recencyBoost?: number;
      exactMatchBoost?: number;
      typeWeights?: Record<string, number>;
    }
  ): SearchResponse {
    const opts = {
      recencyBoost: 0.1,
      exactMatchBoost: 0.2,
      typeWeights: {},
      ...options,
    };

    const now = Date.now();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const rerankedResults = results.results.map((result) => {
      let adjustedScore = result.score;

      // Recency boost
      const docDate = new Date(result.document.createdAt).getTime();
      const ageHours = (now - docDate) / (1000 * 60 * 60);
      const recencyFactor = Math.max(0, 1 - ageHours / 720); // Decay over 30 days
      adjustedScore += recencyFactor * opts.recencyBoost;

      // Exact match boost
      const contentLower = result.document.content.toLowerCase();
      if (contentLower.includes(queryLower)) {
        adjustedScore += opts.exactMatchBoost;
      }

      // Word match density
      const matchingWords = queryWords.filter((w) => contentLower.includes(w));
      const wordMatchRatio = matchingWords.length / queryWords.length;
      adjustedScore += wordMatchRatio * 0.1;

      // Type weights
      const typeWeight = opts.typeWeights[result.document.type] ?? 1;
      adjustedScore *= typeWeight;

      return {
        ...result,
        score: Math.min(1, Math.max(0, adjustedScore)),
      };
    });

    // Re-sort by adjusted score
    rerankedResults.sort((a, b) => b.score - a.score);

    return {
      ...results,
      results: rerankedResults,
    };
  }
}

/**
 * Query expansion for better recall
 */
export class QueryExpander {
  /**
   * Expand query with synonyms and related terms
   */
  expand(query: string): string[] {
    const expansions = [query];
    const words = query.toLowerCase().split(/\s+/);

    // Common programming synonyms
    const synonyms: Record<string, string[]> = {
      function: ['method', 'func', 'fn', 'procedure'],
      class: ['type', 'struct', 'interface'],
      variable: ['var', 'const', 'let', 'field', 'property'],
      error: ['exception', 'bug', 'issue', 'problem'],
      create: ['make', 'build', 'generate', 'new'],
      delete: ['remove', 'destroy', 'drop'],
      update: ['modify', 'change', 'edit', 'patch'],
      get: ['fetch', 'retrieve', 'read', 'query'],
      list: ['array', 'collection', 'items'],
      user: ['account', 'profile', 'member'],
      auth: ['authentication', 'login', 'signin'],
      api: ['endpoint', 'route', 'service'],
      database: ['db', 'storage', 'data store'],
      test: ['spec', 'unit test', 'integration test'],
    };

    for (const word of words) {
      const syns = synonyms[word];
      if (syns) {
        for (const syn of syns) {
          const expanded = words.map((w) => (w === word ? syn : w)).join(' ');
          expansions.push(expanded);
        }
      }
    }

    return [...new Set(expansions)];
  }
}
