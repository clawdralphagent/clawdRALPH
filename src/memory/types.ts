/**
 * Memory System Type Definitions
 * Vector database schemas, embedding types, and search interfaces
 */

import { z } from 'zod';

/**
 * Embedding provider types
 */
export type EmbeddingProviderType = 'openai' | 'ollama' | 'local';

/**
 * Document types that can be indexed
 */
export const DocumentType = {
  CONVERSATION: 'conversation',
  CODE: 'code',
  MARKDOWN: 'markdown',
  TEXT: 'text',
  JSON: 'json',
} as const;

export type DocumentTypeValue = typeof DocumentType[keyof typeof DocumentType];

/**
 * Search mode
 */
export const SearchMode = {
  VECTOR: 'vector',
  FULLTEXT: 'fulltext',
  HYBRID: 'hybrid',
} as const;

export type SearchModeValue = typeof SearchMode[keyof typeof SearchMode];

/**
 * Embedding vector schema
 */
export const EmbeddingSchema = z.object({
  vector: z.array(z.number()),
  model: z.string(),
  dimensions: z.number().int().positive(),
});

export type Embedding = z.infer<typeof EmbeddingSchema>;

/**
 * Document metadata schema
 */
export const DocumentMetadataSchema = z.object({
  source: z.string().optional(),
  path: z.string().optional(),
  language: z.string().optional(),
  author: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
  custom: z.record(z.unknown()).default({}),
});

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

/**
 * Memory document schema
 */
export const MemoryDocumentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['conversation', 'code', 'markdown', 'text', 'json']),
  content: z.string(),
  metadata: DocumentMetadataSchema.default({}),
  chunkIndex: z.number().int().min(0).optional(),
  parentId: z.string().optional(),
  sessionId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export type MemoryDocument = z.infer<typeof MemoryDocumentSchema>;

/**
 * Indexed document with embedding
 */
export const IndexedDocumentSchema = MemoryDocumentSchema.extend({
  embedding: z.array(z.number()).optional(),
  embeddingModel: z.string().optional(),
});

export type IndexedDocument = z.infer<typeof IndexedDocumentSchema>;

/**
 * Search query schema
 */
export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  mode: z.enum(['vector', 'fulltext', 'hybrid']).default('hybrid'),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().min(0).default(0),
  threshold: z.number().min(0).max(1).default(0.7),
  types: z.array(z.enum(['conversation', 'code', 'markdown', 'text', 'json'])).optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dateRange: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  }).optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * Search result schema
 */
export const SearchResultSchema = z.object({
  document: MemoryDocumentSchema,
  score: z.number().min(0).max(1),
  matchType: z.enum(['vector', 'fulltext', 'both']),
  highlights: z.array(z.string()).optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Search response schema
 */
export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  query: z.string(),
  mode: z.enum(['vector', 'fulltext', 'hybrid']),
  totalResults: z.number().int().min(0),
  took: z.number().min(0),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Embedding request schema
 */
export const EmbeddingRequestSchema = z.object({
  texts: z.array(z.string().min(1)),
  model: z.string().optional(),
});

export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;

/**
 * Embedding response schema
 */
export const EmbeddingResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  model: z.string(),
  dimensions: z.number().int().positive(),
  usage: z.object({
    totalTokens: z.number().int().min(0),
  }).optional(),
});

export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;

/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
  /** Provider type */
  readonly type: EmbeddingProviderType;

  /** Get the embedding model name */
  getModel(): string;

  /** Get embedding dimensions */
  getDimensions(): number;

  /** Check if provider is available */
  isAvailable(): Promise<boolean>;

  /** Generate embeddings for texts */
  embed(texts: string[]): Promise<EmbeddingResponse>;

  /** Generate embedding for a single text */
  embedOne(text: string): Promise<number[]>;
}

/**
 * Memory store interface
 */
export interface MemoryStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Close the store */
  close(): Promise<void>;

  /** Add a document to the store */
  add(document: MemoryDocument, embedding?: number[]): Promise<void>;

  /** Add multiple documents */
  addBatch(documents: Array<{ document: MemoryDocument; embedding?: number[] }>): Promise<void>;

  /** Get a document by ID */
  get(id: string): Promise<MemoryDocument | null>;

  /** Update a document */
  update(id: string, updates: Partial<MemoryDocument>): Promise<void>;

  /** Delete a document */
  delete(id: string): Promise<void>;

  /** Delete documents by session */
  deleteBySession(sessionId: string): Promise<number>;

  /** Search documents */
  search(query: SearchQuery, queryEmbedding?: number[]): Promise<SearchResponse>;

  /** Get document count */
  count(filters?: { type?: DocumentTypeValue; sessionId?: string }): Promise<number>;

  /** Clear all documents */
  clear(): Promise<void>;
}

/**
 * Memory indexer interface
 */
export interface MemoryIndexer {
  /** Index a conversation message */
  indexConversation(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<string>;

  /** Index a code file */
  indexCodeFile(
    filePath: string,
    content: string,
    language?: string
  ): Promise<string[]>;

  /** Index a markdown document */
  indexMarkdown(
    filePath: string,
    content: string
  ): Promise<string[]>;

  /** Index plain text */
  indexText(
    content: string,
    metadata?: DocumentMetadata
  ): Promise<string>;

  /** Re-index a document */
  reindex(documentId: string): Promise<void>;

  /** Remove document from index */
  remove(documentId: string): Promise<void>;
}

/**
 * Memory configuration schema
 */
export const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  databasePath: z.string().default('.clawdralph/memory.db'),
  embeddingProvider: z.enum(['openai', 'ollama', 'local']).default('openai'),
  embeddingModel: z.string().optional(),
  chunkSize: z.number().int().positive().default(1000),
  chunkOverlap: z.number().int().min(0).default(200),
  maxDocuments: z.number().int().positive().default(100000),
  cacheEmbeddings: z.boolean().default(true),
  autoIndex: z.boolean().default(true),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

/**
 * Chunk for text splitting
 */
export interface TextChunk {
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
  metadata?: Record<string, unknown>;
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  separator?: string | RegExp;
  keepSeparator?: boolean;
}

/**
 * Helper to create a memory document
 */
export function createMemoryDocument(data: {
  id?: string;
  type: DocumentTypeValue;
  content: string;
  metadata?: Partial<DocumentMetadata>;
  sessionId?: string;
  parentId?: string;
  chunkIndex?: number;
}): MemoryDocument {
  const now = new Date().toISOString();

  return MemoryDocumentSchema.parse({
    id: data.id ?? `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: data.type,
    content: data.content,
    metadata: data.metadata ?? {},
    sessionId: data.sessionId,
    parentId: data.parentId,
    chunkIndex: data.chunkIndex,
    createdAt: now,
  });
}

/**
 * Default memory configuration
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  databasePath: '.clawdralph/memory.db',
  embeddingProvider: 'openai',
  chunkSize: 1000,
  chunkOverlap: 200,
  maxDocuments: 100000,
  cacheEmbeddings: true,
  autoIndex: true,
};
