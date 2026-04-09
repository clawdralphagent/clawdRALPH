/**
 * Vector Database using SQLite + sqlite-vec
 * Provides persistent storage for documents and embeddings
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createLogger } from '../logging/logger.js';
import { getDataDir } from '../utils/paths.js';
import type {
  MemoryStore,
  MemoryDocument,
  SearchQuery,
  SearchResponse,
  SearchResult,
  DocumentTypeValue,
} from './types.js';
import { DocumentMetadataSchema } from './types.js';
import * as path from 'path';
import * as fs from 'fs';

const log = createLogger('memory-db');

/**
 * SQLite Vector Memory Store
 */
export class SQLiteMemoryStore implements MemoryStore {
  private db: Database.Database | null = null;
  private dbPath: string;
  private dimensions: number;
  private initialized: boolean = false;

  constructor(dbPath?: string, dimensions: number = 1536) {
    this.dbPath = dbPath ?? path.join(getDataDir(), 'memory.db');
    this.dimensions = dimensions;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    log.info('Initializing memory database', { path: this.dbPath, dimensions: this.dimensions });

    // Open database
    this.db = new Database(this.dbPath);

    // Load sqlite-vec extension
    sqliteVec.load(this.db);

    // Create tables
    this.createTables();

    this.initialized = true;
    log.info('Memory database initialized');
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        chunk_index INTEGER,
        parent_id TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
      CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);
      CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);
      CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
    `);

    // FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        id,
        content,
        content='documents',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, id, content) VALUES('delete', old.rowid, old.id, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, id, content) VALUES('delete', old.rowid, old.id, old.content);
        INSERT INTO documents_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;
    `);

    // Vector table using sqlite-vec
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[${this.dimensions}]
      );
    `);

    // Embedding metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_metadata (
        document_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `);

    log.debug('Database tables created');
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      log.info('Memory database closed');
    }
  }

  /**
   * Add a document to the store
   */
  async add(document: MemoryDocument, embedding?: number[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const insertDoc = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, type, content, metadata, chunk_index, parent_id, session_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDoc.run(
      document.id,
      document.type,
      document.content,
      JSON.stringify(document.metadata),
      document.chunkIndex ?? null,
      document.parentId ?? null,
      document.sessionId ?? null,
      document.createdAt,
      document.updatedAt ?? null
    );

    if (embedding && embedding.length === this.dimensions) {
      await this.addEmbedding(document.id, embedding);
    }

    log.debug('Document added', { id: document.id, type: document.type });
  }

  /**
   * Add embedding for a document
   */
  private async addEmbedding(documentId: string, embedding: number[], model?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Insert into vector table
    const insertVec = this.db.prepare(`
      INSERT OR REPLACE INTO document_embeddings (id, embedding)
      VALUES (?, ?)
    `);

    // Convert to Float32Array for sqlite-vec
    const vecData = new Float32Array(embedding);
    insertVec.run(documentId, vecData);

    // Insert metadata
    const insertMeta = this.db.prepare(`
      INSERT OR REPLACE INTO embedding_metadata (document_id, model, created_at)
      VALUES (?, ?, ?)
    `);

    insertMeta.run(documentId, model ?? 'unknown', new Date().toISOString());
  }

  /**
   * Add multiple documents
   */
  async addBatch(documents: Array<{ document: MemoryDocument; embedding?: number[] }>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(() => {
      for (const { document, embedding } of documents) {
        // Can't await inside sync transaction, so we do it synchronously
        const insertDoc = this.db!.prepare(`
          INSERT OR REPLACE INTO documents (id, type, content, metadata, chunk_index, parent_id, session_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertDoc.run(
          document.id,
          document.type,
          document.content,
          JSON.stringify(document.metadata),
          document.chunkIndex ?? null,
          document.parentId ?? null,
          document.sessionId ?? null,
          document.createdAt,
          document.updatedAt ?? null
        );

        if (embedding && embedding.length === this.dimensions) {
          const insertVec = this.db!.prepare(`
            INSERT OR REPLACE INTO document_embeddings (id, embedding)
            VALUES (?, ?)
          `);
          const vecData = new Float32Array(embedding);
          insertVec.run(document.id, vecData);

          const insertMeta = this.db!.prepare(`
            INSERT OR REPLACE INTO embedding_metadata (document_id, model, created_at)
            VALUES (?, ?, ?)
          `);
          insertMeta.run(document.id, 'batch', new Date().toISOString());
        }
      }
    });

    transaction();
    log.debug('Batch documents added', { count: documents.length });
  }

  /**
   * Get a document by ID
   */
  async get(id: string): Promise<MemoryDocument | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM documents WHERE id = ?
    `);

    const row = stmt.get(id) as DatabaseRow | undefined;

    if (!row) return null;

    return this.rowToDocument(row);
  }

  /**
   * Update a document
   */
  async update(id: string, updates: Partial<MemoryDocument>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }

    const updated: MemoryDocument = {
      ...existing,
      ...updates,
      id: existing.id, // Can't change ID
      updatedAt: new Date().toISOString(),
    };

    await this.add(updated);
    log.debug('Document updated', { id });
  }

  /**
   * Delete a document
   */
  async delete(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Delete from vector table first
    this.db.prepare('DELETE FROM document_embeddings WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM embedding_metadata WHERE document_id = ?').run(id);

    // Delete from documents table (triggers will handle FTS)
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);

    log.debug('Document deleted', { id });
  }

  /**
   * Delete documents by session
   */
  async deleteBySession(sessionId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    // Get IDs first
    const ids = this.db
      .prepare('SELECT id FROM documents WHERE session_id = ?')
      .all(sessionId) as Array<{ id: string }>;

    // Delete from vector tables
    for (const { id } of ids) {
      this.db.prepare('DELETE FROM document_embeddings WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM embedding_metadata WHERE document_id = ?').run(id);
    }

    // Delete from documents
    const result = this.db
      .prepare('DELETE FROM documents WHERE session_id = ?')
      .run(sessionId);

    log.debug('Documents deleted by session', { sessionId, count: result.changes });
    return result.changes;
  }

  /**
   * Search documents
   */
  async search(query: SearchQuery, queryEmbedding?: number[]): Promise<SearchResponse> {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();
    const results: SearchResult[] = [];

    // Build filter conditions
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.types && query.types.length > 0) {
      conditions.push(`type IN (${query.types.map(() => '?').join(',')})`);
      params.push(...query.types);
    }

    if (query.sessionId) {
      conditions.push('session_id = ?');
      params.push(query.sessionId);
    }

    if (query.dateRange?.start) {
      conditions.push('created_at >= ?');
      params.push(query.dateRange.start);
    }

    if (query.dateRange?.end) {
      conditions.push('created_at <= ?');
      params.push(query.dateRange.end);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Vector search
    if ((query.mode === 'vector' || query.mode === 'hybrid') && queryEmbedding) {
      const vectorResults = await this.vectorSearch(
        queryEmbedding,
        query.limit * 2, // Get more for hybrid
        query.threshold,
        whereClause,
        params
      );
      results.push(...vectorResults);
    }

    // Full-text search
    if (query.mode === 'fulltext' || query.mode === 'hybrid') {
      const ftsResults = await this.fulltextSearch(
        query.query,
        query.limit * 2,
        whereClause,
        params
      );

      // Merge with vector results for hybrid
      for (const ftsResult of ftsResults) {
        const existing = results.find((r) => r.document.id === ftsResult.document.id);
        if (existing) {
          // Combine scores
          existing.score = (existing.score + ftsResult.score) / 2;
          existing.matchType = 'both';
        } else {
          results.push(ftsResult);
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply offset and limit
    const paged = results.slice(query.offset, query.offset + query.limit);

    const took = Date.now() - startTime;
    log.debug('Search completed', { query: query.query, mode: query.mode, results: paged.length, took });

    return {
      results: paged,
      query: query.query,
      mode: query.mode,
      totalResults: results.length,
      took,
    };
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(
    queryEmbedding: number[],
    limit: number,
    threshold: number,
    whereClause: string,
    _params: unknown[]
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    // sqlite-vec KNN search
    const vecData = new Float32Array(queryEmbedding);

    const stmt = this.db.prepare(`
      SELECT
        e.id,
        e.distance
      FROM document_embeddings e
      WHERE e.embedding MATCH ?
        AND k = ?
      ORDER BY e.distance ASC
    `);

    const vecResults = stmt.all(vecData, limit) as Array<{ id: string; distance: number }>;

    const results: SearchResult[] = [];

    for (const { id, distance } of vecResults) {
      // Convert distance to similarity score (assuming cosine distance)
      const score = 1 - distance;

      if (score < threshold) continue;

      // Get full document
      const doc = await this.get(id);
      if (!doc) continue;

      // Apply additional filters if needed
      if (whereClause) {
        const checkStmt = this.db.prepare(`
          SELECT 1 FROM documents ${whereClause} AND id = ?
        `);
        const matches = checkStmt.get(..._params, id);
        if (!matches) continue;
      }

      results.push({
        document: doc,
        score,
        matchType: 'vector',
      });
    }

    return results;
  }

  /**
   * Full-text search
   */
  private async fulltextSearch(
    query: string,
    limit: number,
    whereClause: string,
    params: unknown[]
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    // FTS5 search with BM25 ranking
    const ftsQuery = query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w}"*`)
      .join(' OR ');

    const sql = `
      SELECT
        d.*,
        bm25(documents_fts) as rank
      FROM documents_fts f
      JOIN documents d ON f.id = d.id
      WHERE documents_fts MATCH ?
      ${whereClause ? `AND ${whereClause.replace('WHERE ', '')}` : ''}
      ORDER BY rank
      LIMIT ?
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(ftsQuery, ...params, limit) as Array<DatabaseRow & { rank: number }>;

    const results: SearchResult[] = [];

    for (const row of rows) {
      // Normalize BM25 score to 0-1 range (approximate)
      const score = Math.min(1, Math.max(0, (-row.rank + 10) / 20));

      results.push({
        document: this.rowToDocument(row),
        score,
        matchType: 'fulltext',
        highlights: this.extractHighlights(row.content, query),
      });
    }

    return results;
  }

  /**
   * Extract search highlights
   */
  private extractHighlights(content: string, query: string): string[] {
    const words = query.toLowerCase().split(/\s+/);
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (words.some((w) => lower.includes(w))) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break;
      }
    }

    return highlights;
  }

  /**
   * Get document count
   */
  async count(filters?: { type?: DocumentTypeValue; sessionId?: string }): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT COUNT(*) as count FROM documents';
    const params: unknown[] = [];

    if (filters) {
      const conditions: string[] = [];

      if (filters.type) {
        conditions.push('type = ?');
        params.push(filters.type);
      }

      if (filters.sessionId) {
        conditions.push('session_id = ?');
        params.push(filters.sessionId);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    const result = this.db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Clear all documents
   */
  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec('DELETE FROM document_embeddings');
    this.db.exec('DELETE FROM embedding_metadata');
    this.db.exec('DELETE FROM documents');

    log.info('Memory database cleared');
  }

  /**
   * Convert database row to MemoryDocument
   */
  private rowToDocument(row: DatabaseRow): MemoryDocument {
    return {
      id: row.id,
      type: row.type as DocumentTypeValue,
      content: row.content,
      metadata: DocumentMetadataSchema.parse(JSON.parse(row.metadata || '{}')),
      chunkIndex: row.chunk_index ?? undefined,
      parentId: row.parent_id ?? undefined,
      sessionId: row.session_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
    };
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    embeddingCount: number;
    databaseSize: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const docCount = (this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }).count;
    const embCount = (this.db.prepare('SELECT COUNT(*) as count FROM embedding_metadata').get() as { count: number }).count;

    let dbSize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      dbSize = stats.size;
    } catch {
      // Ignore
    }

    return {
      documentCount: docCount,
      embeddingCount: embCount,
      databaseSize: dbSize,
    };
  }
}

/**
 * Database row type
 */
interface DatabaseRow {
  id: string;
  type: string;
  content: string;
  metadata: string;
  chunk_index: number | null;
  parent_id: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string | null;
}
