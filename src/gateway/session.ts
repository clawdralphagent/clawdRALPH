/**
 * Session management for the gateway
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../logging/logger.js';
import { getSessionsDir, ensureDir } from '../utils/paths.js';
import { getEventBus, GatewayEventType } from './events.js';
import type { SessionInfo } from './types.js';

const log = createLogger('session');

/**
 * Full session data including conversation and state
 */
export interface SessionData extends SessionInfo {
  conversation: ConversationEntry[];
  context: Record<string, unknown>;
  loopState?: LoopState;
}

/**
 * Conversation entry
 */
export interface ConversationEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Loop state for Ralph integration
 */
export interface LoopState {
  prdFile: string;
  iteration: number;
  maxIterations: number;
  currentStory?: string;
  completedStories: string[];
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Session manager options
 */
export interface SessionManagerOptions {
  sessionsDir?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

/**
 * Session manager class
 */
export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private sessionsDir: string;
  private autoSave: boolean;
  private autoSaveInterval: number;
  private saveTimer?: NodeJS.Timeout;
  private dirtySessionIds: Set<string> = new Set();

  constructor(options: SessionManagerOptions = {}) {
    this.sessionsDir = options.sessionsDir ?? getSessionsDir();
    this.autoSave = options.autoSave ?? true;
    this.autoSaveInterval = options.autoSaveInterval ?? 30000; // 30 seconds

    // Ensure sessions directory exists
    ensureDir(this.sessionsDir);

    // Start auto-save timer
    if (this.autoSave) {
      this.startAutoSave();
    }
  }

  /**
   * Create a new session
   */
  async create(clientId: string, metadata: Record<string, unknown> = {}): Promise<SessionData> {
    const sessionId = uuidv4();
    const now = new Date();

    const session: SessionData = {
      id: sessionId,
      clientId,
      state: 'active',
      createdAt: now,
      updatedAt: now,
      metadata,
      conversation: [],
      context: {},
    };

    this.sessions.set(sessionId, session);
    this.markDirty(sessionId);

    log.info('Session created', { sessionId, clientId });

    // Emit event
    await getEventBus().emit(GatewayEventType.SESSION_CREATED, {
      sessionId,
      clientId,
      metadata,
    }, { sessionId, clientId });

    return session;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAll(): SessionData[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by client ID
   */
  getByClientId(clientId: string): SessionData[] {
    return this.getAll().filter((s) => s.clientId === clientId);
  }

  /**
   * Get active sessions
   */
  getActive(): SessionData[] {
    return this.getAll().filter((s) => s.state === 'active');
  }

  /**
   * Update a session
   */
  async update(
    sessionId: string,
    updates: Partial<Pick<SessionData, 'state' | 'metadata' | 'context' | 'loopState'>>
  ): Promise<SessionData | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn('Session not found for update', { sessionId });
      return undefined;
    }

    // Apply updates
    if (updates.state !== undefined) session.state = updates.state;
    if (updates.metadata !== undefined) session.metadata = { ...session.metadata, ...updates.metadata };
    if (updates.context !== undefined) session.context = { ...session.context, ...updates.context };
    if (updates.loopState !== undefined) session.loopState = updates.loopState;

    session.updatedAt = new Date();
    this.markDirty(sessionId);

    log.debug('Session updated', { sessionId, updates: Object.keys(updates) });

    // Emit event
    await getEventBus().emit(GatewayEventType.SESSION_UPDATED, {
      sessionId,
      changes: updates,
    }, { sessionId, clientId: session.clientId });

    return session;
  }

  /**
   * Add a conversation entry
   */
  addConversationEntry(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ): ConversationEntry | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn('Session not found for conversation entry', { sessionId });
      return undefined;
    }

    const entry: ConversationEntry = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    session.conversation.push(entry);
    session.updatedAt = new Date();
    this.markDirty(sessionId);

    return entry;
  }

  /**
   * End a session
   */
  async end(sessionId: string, reason?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn('Session not found for end', { sessionId });
      return false;
    }

    session.state = 'completed';
    session.updatedAt = new Date();
    this.markDirty(sessionId);

    // Save immediately
    await this.saveSession(sessionId);

    log.info('Session ended', { sessionId, reason });

    // Emit event
    await getEventBus().emit(GatewayEventType.SESSION_ENDED, {
      sessionId,
      reason,
    }, { sessionId, clientId: session.clientId });

    return true;
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.sessions.delete(sessionId);
    this.dirtySessionIds.delete(sessionId);

    // Delete file
    const filePath = this.getSessionFilePath(sessionId);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    log.info('Session deleted', { sessionId });
    return true;
  }

  /**
   * Mark a session as dirty (needs saving)
   */
  private markDirty(sessionId: string): void {
    this.dirtySessionIds.add(sessionId);
  }

  /**
   * Get session file path
   */
  private getSessionFilePath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }

  /**
   * Save a session to disk
   */
  async saveSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      const filePath = this.getSessionFilePath(sessionId);
      const data = JSON.stringify(session, null, 2);
      writeFileSync(filePath, data, 'utf-8');
      this.dirtySessionIds.delete(sessionId);
      log.debug('Session saved', { sessionId });
      return true;
    } catch (error) {
      log.error('Failed to save session', error, { sessionId });
      return false;
    }
  }

  /**
   * Save all dirty sessions
   */
  async saveAll(): Promise<void> {
    const dirtyIds = Array.from(this.dirtySessionIds);
    await Promise.all(dirtyIds.map((id) => this.saveSession(id)));
  }

  /**
   * Load a session from disk
   */
  loadSession(sessionId: string): SessionData | undefined {
    const filePath = this.getSessionFilePath(sessionId);

    if (!existsSync(filePath)) {
      return undefined;
    }

    try {
      const data = readFileSync(filePath, 'utf-8');
      const session = JSON.parse(data) as SessionData;

      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      session.conversation = session.conversation.map((entry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      }));

      this.sessions.set(sessionId, session);
      log.debug('Session loaded', { sessionId });

      return session;
    } catch (error) {
      log.error('Failed to load session', error, { sessionId });
      return undefined;
    }
  }

  /**
   * Load all sessions from disk
   */
  loadAll(): void {
    if (!existsSync(this.sessionsDir)) {
      return;
    }

    const files = readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const sessionId = file.replace('.json', '');
      this.loadSession(sessionId);
    }

    log.info('Sessions loaded', { count: files.length });
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      void this.saveAll();
    }, this.autoSaveInterval);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  /**
   * Get session count
   */
  getCount(): number {
    return this.sessions.size;
  }

  /**
   * Get active session count
   */
  getActiveCount(): number {
    return this.getActive().length;
  }

  /**
   * Clean up completed/failed sessions older than maxAge
   */
  cleanup(maxAgeMs: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (
        (session.state === 'completed' || session.state === 'failed') &&
        now - session.updatedAt.getTime() > maxAgeMs
      ) {
        void this.delete(sessionId);
        cleaned++;
      }
    }

    log.info('Session cleanup completed', { cleaned });
    return cleaned;
  }

  /**
   * Dispose the session manager
   */
  async dispose(): Promise<void> {
    this.stopAutoSave();
    await this.saveAll();
    this.sessions.clear();
  }
}

// Global session manager instance
let globalSessionManager: SessionManager | null = null;

/**
 * Get the global session manager
 */
export function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager();
  }
  return globalSessionManager;
}

/**
 * Initialize the session manager with options
 */
export function initSessionManager(options: SessionManagerOptions = {}): SessionManager {
  if (globalSessionManager) {
    void globalSessionManager.dispose();
  }
  globalSessionManager = new SessionManager(options);
  return globalSessionManager;
}
