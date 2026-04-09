/**
 * Memory Indexer
 * Handles indexing of conversations, code, and documents
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logging/logger.js';
import type {
  MemoryStore,
  EmbeddingProvider,
  MemoryIndexer,
  DocumentMetadata,
} from './types.js';
import { createMemoryDocument, DocumentType } from './types.js';
import { TextChunker } from './search.js';

const log = createLogger('indexer');

/**
 * Memory Indexer Implementation
 */
export class DefaultMemoryIndexer implements MemoryIndexer {
  private store: MemoryStore;
  private embeddingProvider: EmbeddingProvider;
  private chunker: TextChunker;

  constructor(store: MemoryStore, embeddingProvider: EmbeddingProvider) {
    this.store = store;
    this.embeddingProvider = embeddingProvider;
    this.chunker = new TextChunker();
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
    const document = createMemoryDocument({
      type: DocumentType.CONVERSATION,
      content: `[${role}]: ${content}`,
      sessionId,
      metadata: {
        custom: {
          role,
          ...metadata,
        },
      },
    });

    // Generate embedding
    const embedding = await this.embeddingProvider.embedOne(document.content);

    await this.store.add(document, embedding);

    log.debug('Indexed conversation', { id: document.id, sessionId, role });
    return document.id;
  }

  /**
   * Index a code file
   */
  async indexCodeFile(
    filePath: string,
    content: string,
    language?: string
  ): Promise<string[]> {
    const lang = language ?? this.detectLanguage(filePath);

    // Chunk code into semantic units
    const chunks = this.chunker.chunkCode(content, lang);

    const ids: string[] = [];
    const parentId = `code_${path.basename(filePath)}_${Date.now()}`;

    // Create parent document
    const parentDoc = createMemoryDocument({
      id: parentId,
      type: DocumentType.CODE,
      content: content.slice(0, 500), // Summary
      metadata: {
        path: filePath,
        language: lang,
        custom: {
          totalChunks: chunks.length,
          fileSize: content.length,
        },
      },
    });

    await this.store.add(parentDoc);
    ids.push(parentId);

    // Index each chunk
    for (const chunk of chunks) {
      const chunkDoc = createMemoryDocument({
        type: DocumentType.CODE,
        content: chunk.content,
        parentId,
        chunkIndex: chunk.index,
        metadata: {
          path: filePath,
          language: lang,
          custom: {
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            ...chunk.metadata,
          },
        },
      });

      const embedding = await this.embeddingProvider.embedOne(chunk.content);
      await this.store.add(chunkDoc, embedding);
      ids.push(chunkDoc.id);
    }

    log.info('Indexed code file', { path: filePath, language: lang, chunks: chunks.length });
    return ids;
  }

  /**
   * Index a markdown document
   */
  async indexMarkdown(
    filePath: string,
    content: string
  ): Promise<string[]> {
    const chunks = this.chunker.chunkMarkdown(content);

    const ids: string[] = [];
    const parentId = `md_${path.basename(filePath)}_${Date.now()}`;

    // Create parent document
    const parentDoc = createMemoryDocument({
      id: parentId,
      type: DocumentType.MARKDOWN,
      content: content.slice(0, 500),
      metadata: {
        path: filePath,
        custom: {
          totalChunks: chunks.length,
          fileSize: content.length,
        },
      },
    });

    await this.store.add(parentDoc);
    ids.push(parentId);

    // Index each chunk
    for (const chunk of chunks) {
      const chunkDoc = createMemoryDocument({
        type: DocumentType.MARKDOWN,
        content: chunk.content,
        parentId,
        chunkIndex: chunk.index,
        metadata: {
          path: filePath,
          custom: chunk.metadata,
        },
      });

      const embedding = await this.embeddingProvider.embedOne(chunk.content);
      await this.store.add(chunkDoc, embedding);
      ids.push(chunkDoc.id);
    }

    log.info('Indexed markdown', { path: filePath, chunks: chunks.length });
    return ids;
  }

  /**
   * Index plain text
   */
  async indexText(
    content: string,
    metadata?: DocumentMetadata
  ): Promise<string> {
    const document = createMemoryDocument({
      type: DocumentType.TEXT,
      content,
      metadata,
    });

    const embedding = await this.embeddingProvider.embedOne(content);
    await this.store.add(document, embedding);

    log.debug('Indexed text', { id: document.id });
    return document.id;
  }

  /**
   * Re-index a document (update embedding)
   */
  async reindex(documentId: string): Promise<void> {
    const document = await this.store.get(documentId);

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const embedding = await this.embeddingProvider.embedOne(document.content);
    await this.store.add(document, embedding);

    log.debug('Re-indexed document', { id: documentId });
  }

  /**
   * Remove document from index
   */
  async remove(documentId: string): Promise<void> {
    await this.store.delete(documentId);
    log.debug('Removed from index', { id: documentId });
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.kt': 'kotlin',
      '.rb': 'ruby',
      '.php': 'php',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.swift': 'swift',
      '.scala': 'scala',
      '.r': 'r',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bash': 'shell',
      '.zsh': 'shell',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.json': 'json',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.vue': 'vue',
      '.svelte': 'svelte',
    };

    return languageMap[ext] ?? 'unknown';
  }
}

/**
 * Batch Indexer for indexing multiple files
 */
export class BatchIndexer {
  private indexer: MemoryIndexer;

  constructor(indexer: MemoryIndexer) {
    this.indexer = indexer;
  }

  /**
   * Index a directory of files
   */
  async indexDirectory(
    dirPath: string,
    options?: {
      extensions?: string[];
      exclude?: string[];
      recursive?: boolean;
    }
  ): Promise<{ indexed: number; errors: number; files: string[] }> {
    const opts = {
      extensions: ['.ts', '.js', '.py', '.md', '.txt'],
      exclude: ['node_modules', '.git', 'dist', 'build', '__pycache__'],
      recursive: true,
      ...options,
    };

    const files = await this.collectFiles(dirPath, opts.extensions, opts.exclude, opts.recursive);

    let indexed = 0;
    let errors = 0;
    const indexedFiles: string[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const ext = path.extname(file).toLowerCase();

        if (ext === '.md') {
          await this.indexer.indexMarkdown(file, content);
        } else if (['.txt'].includes(ext)) {
          await this.indexer.indexText(content, { path: file, custom: {}, tags: [] });
        } else {
          await this.indexer.indexCodeFile(file, content);
        }

        indexed++;
        indexedFiles.push(file);
      } catch (error) {
        log.error('Failed to index file', { file, error });
        errors++;
      }
    }

    log.info('Directory indexing complete', { dirPath, indexed, errors });
    return { indexed, errors, files: indexedFiles };
  }

  /**
   * Collect files from directory
   */
  private async collectFiles(
    dirPath: string,
    extensions: string[],
    exclude: string[],
    recursive: boolean
  ): Promise<string[]> {
    const files: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Check exclusions
      if (exclude.some((ex) => entry.name.includes(ex))) {
        continue;
      }

      if (entry.isDirectory() && recursive) {
        const subFiles = await this.collectFiles(fullPath, extensions, exclude, recursive);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }
}

/**
 * File Watcher for automatic indexing
 */
export class FileWatcher {
  private indexer: MemoryIndexer;
  private watchers: Map<string, fs.FSWatcher> = new Map();

  constructor(indexer: MemoryIndexer) {
    this.indexer = indexer;
  }

  /**
   * Watch a directory for changes
   */
  watch(dirPath: string, options?: { extensions?: string[] }): void {
    const opts = {
      extensions: ['.ts', '.js', '.py', '.md'],
      ...options,
    };

    if (this.watchers.has(dirPath)) {
      log.warn('Already watching directory', { dirPath });
      return;
    }

    const watcher = fs.watch(dirPath, { recursive: true }, async (event, filename) => {
      if (!filename) return;

      const ext = path.extname(filename).toLowerCase();
      if (!opts.extensions.includes(ext)) return;

      const fullPath = path.join(dirPath, filename);

      if (event === 'rename') {
        // File created or deleted
        if (fs.existsSync(fullPath)) {
          await this.handleFileChange(fullPath);
        }
      } else if (event === 'change') {
        await this.handleFileChange(fullPath);
      }
    });

    this.watchers.set(dirPath, watcher);
    log.info('Watching directory', { dirPath });
  }

  /**
   * Stop watching a directory
   */
  unwatch(dirPath: string): void {
    const watcher = this.watchers.get(dirPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(dirPath);
      log.info('Stopped watching directory', { dirPath });
    }
  }

  /**
   * Stop all watchers
   */
  unwatchAll(): void {
    for (const [dirPath, watcher] of this.watchers) {
      watcher.close();
      log.debug('Stopped watching', { dirPath });
    }
    this.watchers.clear();
  }

  /**
   * Handle file change
   */
  private async handleFileChange(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.md') {
        await this.indexer.indexMarkdown(filePath, content);
      } else {
        await this.indexer.indexCodeFile(filePath, content);
      }

      log.debug('Auto-indexed file change', { path: filePath });
    } catch (error) {
      log.error('Failed to auto-index file', { path: filePath, error });
    }
  }
}

/**
 * Create a complete memory indexing system
 */
export function createIndexingSystem(
  store: MemoryStore,
  embeddingProvider: EmbeddingProvider
): {
  indexer: MemoryIndexer;
  batchIndexer: BatchIndexer;
  watcher: FileWatcher;
} {
  const indexer = new DefaultMemoryIndexer(store, embeddingProvider);
  const batchIndexer = new BatchIndexer(indexer);
  const watcher = new FileWatcher(indexer);

  return { indexer, batchIndexer, watcher };
}
