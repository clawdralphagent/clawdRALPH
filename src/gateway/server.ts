/**
 * WebSocket Gateway Server
 */

import { Hono } from 'hono';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server as HttpServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../logging/logger.js';
import { getConfig } from '../config/loader.js';
import { getEventBus, GatewayEventType } from './events.js';
import { getSessionManager } from './session.js';
import { getAuthManager } from './auth.js';
import {
  parseMessage,
  serializeMessage,
  createWelcomeMessage,
  createAuthResponse,
  createErrorMessage,
  createPongMessage,
  createResponseMessage,
  ErrorCode,
  PROTOCOL_VERSION,
} from './protocol.js';
import type {
  ConnectionMeta,
  ClientRole,
  GatewayStats,
  GatewayMessage,
} from './types.js';

const log = createLogger('gateway');

/**
 * Extended WebSocket with metadata
 */
interface ExtendedWebSocket extends WebSocket {
  meta: ConnectionMeta;
  isAlive: boolean;
}

/**
 * Gateway server options
 */
export interface GatewayServerOptions {
  port?: number;
  bind?: string;
  enableAuth?: boolean;
  authToken?: string;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

/**
 * Gateway server class
 */
export class GatewayServer {
  private app: Hono;
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private options: Required<GatewayServerOptions>;
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private stats: GatewayStats;
  private isRunning = false;
  private startTime?: Date;

  constructor(options: GatewayServerOptions = {}) {
    const config = getConfig();

    this.options = {
      port: options.port ?? config.gateway.port,
      bind: options.bind ?? config.gateway.bind,
      enableAuth: options.enableAuth ?? config.gateway.enableAuth,
      authToken: options.authToken ?? config.gateway.authToken ?? '',
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      heartbeatTimeout: options.heartbeatTimeout ?? 10000,
    };

    this.app = new Hono();
    this.stats = this.initStats();

    // Setup HTTP routes
    this.setupRoutes();

    // Register default auth token if provided
    if (this.options.authToken) {
      getAuthManager().registerToken(this.options.authToken, 'admin');
    }
  }

  /**
   * Initialize stats
   */
  private initStats(): GatewayStats {
    return {
      uptime: 0,
      connections: {
        total: 0,
        authenticated: 0,
        byRole: {
          admin: 0,
          user: 0,
          channel: 0,
          node: 0,
          viewer: 0,
        },
      },
      sessions: {
        active: 0,
        total: 0,
      },
      messages: {
        received: 0,
        sent: 0,
        errors: 0,
      },
    };
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (c) => {
      return c.json({ status: 'ok', version: PROTOCOL_VERSION });
    });

    // Stats endpoint
    this.app.get('/stats', (c) => {
      this.updateStats();
      return c.json(this.stats);
    });

    // Sessions endpoint
    this.app.get('/sessions', (c) => {
      const sessions = getSessionManager().getAll().map((s) => ({
        id: s.id,
        clientId: s.clientId,
        state: s.state,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      return c.json({ sessions });
    });

    // Clients endpoint
    this.app.get('/clients', (c) => {
      const clients = Array.from(this.clients.values()).map((ws) => ({
        id: ws.meta.clientId,
        state: ws.meta.state,
        authenticated: ws.meta.authenticated,
        role: ws.meta.role,
        connectedAt: ws.meta.connectedAt,
        lastActivity: ws.meta.lastPing ?? ws.meta.connectedAt,
      }));
      return c.json({ clients });
    });
  }

  /**
   * Update stats
   */
  private updateStats(): void {
    const sessionManager = getSessionManager();
    const authManager = getAuthManager();

    this.stats.uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    this.stats.connections.total = this.clients.size;
    this.stats.connections.authenticated = authManager.getAuthenticatedCount();
    this.stats.sessions.active = sessionManager.getActiveCount();
    this.stats.sessions.total = sessionManager.getCount();

    // Count by role
    const roleCount: Record<ClientRole, number> = {
      admin: 0,
      user: 0,
      channel: 0,
      node: 0,
      viewer: 0,
    };

    for (const client of authManager.getAuthenticatedClients()) {
      roleCount[client.role]++;
    }
    this.stats.connections.byRole = roleCount;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Gateway server is already running');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server
        this.httpServer = createServer(this.app.fetch as never);

        // Create WebSocket server
        this.wss = new WebSocketServer({ server: this.httpServer });

        // Setup WebSocket handlers
        this.setupWebSocketHandlers();

        // Start heartbeat
        this.startHeartbeat();

        // Start cleanup timer
        this.startCleanup();

        // Load existing sessions
        getSessionManager().loadAll();

        // Start listening
        this.httpServer.listen(this.options.port, this.options.bind, () => {
          this.isRunning = true;
          this.startTime = new Date();

          log.info('Gateway server started', {
            port: this.options.port,
            bind: this.options.bind,
            auth: this.options.enableAuth,
          });

          // Emit server started event
          void getEventBus().emit(GatewayEventType.SERVER_STARTED, {
            port: this.options.port,
            bind: this.options.bind,
          });

          resolve();
        });

        this.httpServer.on('error', (error) => {
          log.error('HTTP server error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    log.info('Stopping gateway server...');

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    // Stop cleanup
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Close all client connections
    for (const [clientId, ws] of this.clients) {
      this.sendMessage(ws, createErrorMessage(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Server shutting down'
      ));
      ws.close(1001, 'Server shutting down');
      this.clients.delete(clientId);
    }

    // Save sessions
    await getSessionManager().saveAll();

    // Close WebSocket server
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          // Close HTTP server
          if (this.httpServer) {
            this.httpServer.close(() => {
              this.isRunning = false;
              log.info('Gateway server stopped');

              // Emit server stopped event
              void getEventBus().emit(GatewayEventType.SERVER_STOPPED, {});

              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup WebSocket handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, req) => {
      const extWs = ws as ExtendedWebSocket;
      const clientId = uuidv4();

      // Initialize connection metadata
      extWs.meta = {
        clientId,
        state: 'connecting',
        authenticated: false,
        role: 'viewer',
        remoteAddress: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        connectedAt: new Date(),
        missedPings: 0,
      };
      extWs.isAlive = true;

      // Store client
      this.clients.set(clientId, extWs);

      log.info('Client connected', {
        clientId,
        remoteAddress: extWs.meta.remoteAddress,
      });

      // Emit connection event
      void getEventBus().emit(GatewayEventType.CLIENT_CONNECTED, {
        clientId,
        remoteAddress: extWs.meta.remoteAddress,
        userAgent: extWs.meta.userAgent,
      }, { clientId });

      // Send welcome message
      this.sendMessage(extWs, createWelcomeMessage(clientId, this.options.enableAuth));
      extWs.meta.state = 'connected';

      // Setup message handler
      ws.on('message', (data) => {
        this.handleMessage(extWs, data.toString());
      });

      // Setup pong handler
      ws.on('pong', () => {
        extWs.isAlive = true;
        extWs.meta.lastPong = new Date();
        extWs.meta.missedPings = 0;
      });

      // Setup close handler
      ws.on('close', (code, reason) => {
        this.handleDisconnect(extWs, code, reason.toString());
      });

      // Setup error handler
      ws.on('error', (error) => {
        log.error('WebSocket error', error, { clientId });
        this.stats.messages.errors++;
      });
    });

    this.wss.on('error', (error) => {
      log.error('WebSocket server error', error);
      void getEventBus().emit(GatewayEventType.SERVER_ERROR, { error: error.message });
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(ws: ExtendedWebSocket, data: string): void {
    const { clientId } = ws.meta;
    this.stats.messages.received++;

    // Parse message
    const parseResult = parseMessage(data);
    if (!parseResult.success) {
      log.warn('Invalid message received', { clientId, error: parseResult.error });
      this.sendMessage(ws, createErrorMessage(
        ErrorCode.INVALID_MESSAGE,
        parseResult.error
      ));
      this.stats.messages.errors++;
      return;
    }

    const message = parseResult.message;

    // Check rate limit
    const rateLimitResult = getAuthManager().checkRateLimit(clientId);
    if (!rateLimitResult.allowed) {
      this.sendMessage(ws, createErrorMessage(
        ErrorCode.RATE_LIMITED,
        `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)} seconds`
      ));
      return;
    }

    // Emit message received event
    void getEventBus().emit(GatewayEventType.MESSAGE_RECEIVED, {
      clientId,
      messageId: message.id,
      messageType: message.type,
    }, { clientId });

    // Route message
    this.routeMessage(ws, message);
  }

  /**
   * Route message to appropriate handler
   */
  private routeMessage(ws: ExtendedWebSocket, message: GatewayMessage): void {
    const { clientId, authenticated } = ws.meta;

    switch (message.type) {
      case 'ping':
        this.sendMessage(ws, createPongMessage(message.id));
        break;

      case 'auth.request':
        this.handleAuthRequest(ws, message);
        break;

      case 'request':
        if (this.options.enableAuth && !authenticated) {
          this.sendMessage(ws, createErrorMessage(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required',
            undefined,
            'payload' in message ? (message.payload as { correlationId?: string }).correlationId : undefined
          ));
          return;
        }
        this.handleRequest(ws, message);
        break;

      case 'event':
        if (this.options.enableAuth && !authenticated) {
          this.sendMessage(ws, createErrorMessage(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required'
          ));
          return;
        }
        this.handleEvent(ws, message);
        break;

      default:
        log.warn('Unknown message type', { clientId, type: message.type });
        this.sendMessage(ws, createErrorMessage(
          ErrorCode.UNKNOWN_MESSAGE_TYPE,
          `Unknown message type: ${message.type}`
        ));
    }
  }

  /**
   * Handle authentication request
   */
  private handleAuthRequest(ws: ExtendedWebSocket, message: GatewayMessage): void {
    const { clientId } = ws.meta;

    if (!this.options.enableAuth) {
      // Auth disabled, auto-authenticate as user
      ws.meta.authenticated = true;
      ws.meta.role = 'user';
      ws.meta.state = 'authenticated';

      this.sendMessage(ws, createAuthResponse(true, clientId, 'user'));

      void getEventBus().emit(GatewayEventType.CLIENT_AUTHENTICATED, {
        clientId,
        role: 'user',
      }, { clientId });

      return;
    }

    // Extract token from message
    const payload = (message as { payload?: { token?: string; role?: ClientRole } }).payload;
    const token = payload?.token;

    if (!token) {
      this.sendMessage(ws, createAuthResponse(false, clientId, 'viewer'));
      return;
    }

    // Authenticate
    const result = getAuthManager().authenticate(clientId, token);

    if (result.success && result.identity) {
      ws.meta.authenticated = true;
      ws.meta.role = result.identity.role;
      ws.meta.state = 'authenticated';

      this.sendMessage(ws, createAuthResponse(
        true,
        clientId,
        result.identity.role,
        result.identity.expiresAt?.toISOString()
      ));

      void getEventBus().emit(GatewayEventType.CLIENT_AUTHENTICATED, {
        clientId,
        role: result.identity.role,
      }, { clientId });
    } else {
      this.sendMessage(ws, createErrorMessage(
        ErrorCode.AUTH_FAILED,
        result.error ?? 'Authentication failed'
      ));
    }
  }

  /**
   * Handle request message
   */
  private handleRequest(ws: ExtendedWebSocket, message: GatewayMessage): void {
    const { clientId } = ws.meta;
    const payload = (message as { payload: { method: string; params?: Record<string, unknown>; correlationId: string } }).payload;
    const { method, params, correlationId } = payload;

    // Check authorization
    if (!getAuthManager().authorize(clientId, method)) {
      this.sendMessage(ws, createResponseMessage(
        correlationId,
        false,
        undefined,
        { code: ErrorCode.FORBIDDEN, message: 'Insufficient permissions' }
      ));
      return;
    }

    // Route to method handler
    this.handleMethod(ws, method, params ?? {}, correlationId);
  }

  /**
   * Handle method call
   */
  private handleMethod(
    ws: ExtendedWebSocket,
    method: string,
    params: Record<string, unknown>,
    correlationId: string
  ): void {
    switch (method) {
      case 'session.create':
        void this.handleSessionCreate(ws, params, correlationId);
        break;

      case 'session.list':
        this.handleSessionList(ws, correlationId);
        break;

      case 'session.get':
        this.handleSessionGet(ws, params, correlationId);
        break;

      case 'session.end':
        void this.handleSessionEnd(ws, params, correlationId);
        break;

      case 'admin.stats':
        this.updateStats();
        this.sendMessage(ws, createResponseMessage(correlationId, true, this.stats));
        break;

      case 'admin.clients':
        const clients = Array.from(this.clients.values()).map((c) => ({
          id: c.meta.clientId,
          role: c.meta.role,
          authenticated: c.meta.authenticated,
          connectedAt: c.meta.connectedAt,
        }));
        this.sendMessage(ws, createResponseMessage(correlationId, true, { clients }));
        break;

      default:
        this.sendMessage(ws, createResponseMessage(
          correlationId,
          false,
          undefined,
          { code: ErrorCode.UNKNOWN_MESSAGE_TYPE, message: `Unknown method: ${method}` }
        ));
    }
  }

  /**
   * Handle session create
   */
  private async handleSessionCreate(
    ws: ExtendedWebSocket,
    params: Record<string, unknown>,
    correlationId: string
  ): Promise<void> {
    const { clientId } = ws.meta;
    const metadata = (params.metadata as Record<string, unknown>) ?? {};

    const session = await getSessionManager().create(clientId, metadata);

    this.sendMessage(ws, createResponseMessage(correlationId, true, {
      sessionId: session.id,
      createdAt: session.createdAt,
    }));
  }

  /**
   * Handle session list
   */
  private handleSessionList(ws: ExtendedWebSocket, correlationId: string): void {
    const { clientId, role } = ws.meta;

    let sessions = getSessionManager().getAll();

    // Non-admin users can only see their own sessions
    if (role !== 'admin') {
      sessions = sessions.filter((s) => s.clientId === clientId);
    }

    const sessionList = sessions.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      state: s.state,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    this.sendMessage(ws, createResponseMessage(correlationId, true, { sessions: sessionList }));
  }

  /**
   * Handle session get
   */
  private handleSessionGet(
    ws: ExtendedWebSocket,
    params: Record<string, unknown>,
    correlationId: string
  ): void {
    const sessionId = params.sessionId as string;

    if (!sessionId) {
      this.sendMessage(ws, createResponseMessage(
        correlationId,
        false,
        undefined,
        { code: ErrorCode.INVALID_MESSAGE, message: 'sessionId required' }
      ));
      return;
    }

    const session = getSessionManager().get(sessionId);

    if (!session) {
      this.sendMessage(ws, createResponseMessage(
        correlationId,
        false,
        undefined,
        { code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' }
      ));
      return;
    }

    this.sendMessage(ws, createResponseMessage(correlationId, true, { session }));
  }

  /**
   * Handle session end
   */
  private async handleSessionEnd(
    ws: ExtendedWebSocket,
    params: Record<string, unknown>,
    correlationId: string
  ): Promise<void> {
    const sessionId = params.sessionId as string;
    const reason = params.reason as string | undefined;

    if (!sessionId) {
      this.sendMessage(ws, createResponseMessage(
        correlationId,
        false,
        undefined,
        { code: ErrorCode.INVALID_MESSAGE, message: 'sessionId required' }
      ));
      return;
    }

    const success = await getSessionManager().end(sessionId, reason);

    if (!success) {
      this.sendMessage(ws, createResponseMessage(
        correlationId,
        false,
        undefined,
        { code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' }
      ));
      return;
    }

    this.sendMessage(ws, createResponseMessage(correlationId, true, { ended: true }));
  }

  /**
   * Handle event message
   */
  private handleEvent(ws: ExtendedWebSocket, message: GatewayMessage): void {
    const payload = (message as { payload: { eventType: string; sessionId?: string; data: unknown } }).payload;
    const { eventType, sessionId, data } = payload;

    // Emit the event
    void getEventBus().emit(
      eventType as never,
      data,
      { sessionId, clientId: ws.meta.clientId }
    );
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: ExtendedWebSocket, code: number, reason: string): void {
    const { clientId } = ws.meta;

    log.info('Client disconnected', { clientId, code, reason });

    // Remove from clients
    this.clients.delete(clientId);

    // Deauthenticate
    getAuthManager().deauthenticate(clientId);

    // Emit disconnect event
    void getEventBus().emit(GatewayEventType.CLIENT_DISCONNECTED, {
      clientId,
      code,
      reason,
    }, { clientId });
  }

  /**
   * Send message to client
   */
  private sendMessage(ws: ExtendedWebSocket, message: GatewayMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage(message));
      this.stats.messages.sent++;

      void getEventBus().emit(GatewayEventType.MESSAGE_SENT, {
        clientId: ws.meta.clientId,
        messageId: message.id,
        messageType: message.type,
      }, { clientId: ws.meta.clientId, persist: false });
    }
  }

  /**
   * Broadcast message to all authenticated clients
   */
  broadcast(message: GatewayMessage, filter?: (ws: ExtendedWebSocket) => boolean): void {
    for (const ws of this.clients.values()) {
      if (ws.meta.authenticated && (!filter || filter(ws))) {
        this.sendMessage(ws, message);
      }
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [clientId, ws] of this.clients) {
        if (!ws.isAlive) {
          ws.meta.missedPings++;

          if (ws.meta.missedPings >= 3) {
            log.warn('Client heartbeat timeout', { clientId, missedPings: ws.meta.missedPings });
            ws.terminate();
            this.clients.delete(clientId);
            continue;
          }
        }

        ws.isAlive = false;
        ws.meta.lastPing = new Date();
        ws.ping();
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      getAuthManager().cleanup();
      getSessionManager().cleanup(24 * 60 * 60 * 1000); // 24 hours
    }, 60000); // Every minute
  }

  /**
   * Get server status
   */
  getStatus(): { running: boolean; port: number; bind: string; clients: number } {
    return {
      running: this.isRunning,
      port: this.options.port,
      bind: this.options.bind,
      clients: this.clients.size,
    };
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}

// Global server instance
let globalServer: GatewayServer | null = null;

/**
 * Get the global gateway server
 */
export function getGatewayServer(): GatewayServer {
  if (!globalServer) {
    globalServer = new GatewayServer();
  }
  return globalServer;
}

/**
 * Initialize and start the gateway server
 */
export async function startGatewayServer(options?: GatewayServerOptions): Promise<GatewayServer> {
  if (globalServer?.isServerRunning()) {
    throw new Error('Gateway server is already running');
  }

  globalServer = new GatewayServer(options);
  await globalServer.start();
  return globalServer;
}

/**
 * Stop the gateway server
 */
export async function stopGatewayServer(): Promise<void> {
  if (globalServer) {
    await globalServer.stop();
    globalServer = null;
  }
}
