/**
 * Authentication and authorization for the gateway
 */

import { createHash, randomBytes } from 'crypto';
import { createLogger } from '../logging/logger.js';
import type { ClientRole, RateLimitConfig, RateLimitState } from './types.js';

const log = createLogger('auth');

/**
 * Token info
 */
export interface TokenInfo {
  token: string;
  role: ClientRole;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Client identity
 */
export interface ClientIdentity {
  id: string;
  role: ClientRole;
  authenticatedAt: Date;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
}

/**
 * Auth result
 */
export interface AuthResult {
  success: boolean;
  identity?: ClientIdentity;
  error?: string;
}

/**
 * Authentication manager
 */
export class AuthManager {
  private tokens: Map<string, TokenInfo> = new Map();
  private clients: Map<string, ClientIdentity> = new Map();
  private rateLimits: Map<string, RateLimitState> = new Map();
  private rateLimitConfig: RateLimitConfig;

  constructor(options: { rateLimitConfig?: RateLimitConfig } = {}) {
    this.rateLimitConfig = options.rateLimitConfig ?? {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
    };
  }

  /**
   * Generate a secure token
   */
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for secure storage
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Register a token
   */
  registerToken(
    token: string,
    role: ClientRole,
    expiresAt?: Date,
    metadata?: Record<string, unknown>
  ): void {
    const hashedToken = this.hashToken(token);
    this.tokens.set(hashedToken, {
      token: hashedToken,
      role,
      expiresAt,
      metadata,
    });
    log.debug('Token registered', { role, expires: expiresAt?.toISOString() });
  }

  /**
   * Revoke a token
   */
  revokeToken(token: string): boolean {
    const hashedToken = this.hashToken(token);
    const deleted = this.tokens.delete(hashedToken);
    if (deleted) {
      log.debug('Token revoked');
    }
    return deleted;
  }

  /**
   * Validate a token
   */
  validateToken(token: string): TokenInfo | null {
    const hashedToken = this.hashToken(token);
    const tokenInfo = this.tokens.get(hashedToken);

    if (!tokenInfo) {
      return null;
    }

    // Check expiration
    if (tokenInfo.expiresAt && tokenInfo.expiresAt < new Date()) {
      this.tokens.delete(hashedToken);
      return null;
    }

    return tokenInfo;
  }

  /**
   * Authenticate a client with a token
   */
  authenticate(clientId: string, token: string): AuthResult {
    // Validate token
    const tokenInfo = this.validateToken(token);

    if (!tokenInfo) {
      log.warn('Authentication failed: invalid token', { clientId });
      return {
        success: false,
        error: 'Invalid or expired token',
      };
    }

    // Create client identity
    const identity: ClientIdentity = {
      id: clientId,
      role: tokenInfo.role,
      authenticatedAt: new Date(),
      expiresAt: tokenInfo.expiresAt,
      metadata: tokenInfo.metadata ?? {},
    };

    this.clients.set(clientId, identity);

    log.info('Client authenticated', { clientId, role: identity.role });

    return {
      success: true,
      identity,
    };
  }

  /**
   * Check if a client is authenticated
   */
  isAuthenticated(clientId: string): boolean {
    const identity = this.clients.get(clientId);

    if (!identity) {
      return false;
    }

    // Check expiration
    if (identity.expiresAt && identity.expiresAt < new Date()) {
      this.clients.delete(clientId);
      return false;
    }

    return true;
  }

  /**
   * Get client identity
   */
  getIdentity(clientId: string): ClientIdentity | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Remove client authentication
   */
  deauthenticate(clientId: string): void {
    this.clients.delete(clientId);
    this.rateLimits.delete(clientId);
    log.debug('Client deauthenticated', { clientId });
  }

  /**
   * Check if a client has a specific role
   */
  hasRole(clientId: string, requiredRole: ClientRole): boolean {
    const identity = this.clients.get(clientId);
    if (!identity) {
      return false;
    }

    // Role hierarchy: admin > user > channel/node > viewer
    const roleHierarchy: Record<ClientRole, number> = {
      admin: 100,
      user: 50,
      channel: 30,
      node: 30,
      viewer: 10,
    };

    return roleHierarchy[identity.role] >= roleHierarchy[requiredRole];
  }

  /**
   * Check authorization for an action
   */
  authorize(clientId: string, action: string): boolean {
    const identity = this.clients.get(clientId);
    if (!identity) {
      return false;
    }

    // Define action permissions
    const actionPermissions: Record<string, ClientRole[]> = {
      // Session actions
      'session.create': ['admin', 'user'],
      'session.read': ['admin', 'user', 'channel', 'node', 'viewer'],
      'session.update': ['admin', 'user'],
      'session.delete': ['admin'],

      // Loop actions
      'loop.start': ['admin', 'user'],
      'loop.stop': ['admin', 'user'],
      'loop.pause': ['admin', 'user'],

      // Channel actions
      'channel.send': ['admin', 'user', 'channel'],
      'channel.receive': ['admin', 'user', 'channel', 'node', 'viewer'],

      // Admin actions
      'admin.config': ['admin'],
      'admin.clients': ['admin'],
      'admin.stats': ['admin', 'user'],
    };

    const allowedRoles = actionPermissions[action];
    if (!allowedRoles) {
      // Unknown action - deny by default
      log.warn('Unknown action in authorization check', { action, clientId });
      return false;
    }

    return allowedRoles.includes(identity.role);
  }

  /**
   * Check rate limit for a client
   */
  checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let state = this.rateLimits.get(clientId);

    // Initialize or reset window
    if (!state || now - state.windowStart >= this.rateLimitConfig.windowMs) {
      state = {
        requests: 0,
        windowStart: now,
      };
      this.rateLimits.set(clientId, state);
    }

    const remaining = Math.max(0, this.rateLimitConfig.maxRequests - state.requests);
    const resetAt = state.windowStart + this.rateLimitConfig.windowMs;

    if (state.requests >= this.rateLimitConfig.maxRequests) {
      log.warn('Rate limit exceeded', { clientId, requests: state.requests });
      return { allowed: false, remaining: 0, resetAt };
    }

    state.requests++;
    return { allowed: true, remaining: remaining - 1, resetAt };
  }

  /**
   * Get rate limit config
   */
  getRateLimitConfig(): RateLimitConfig {
    return { ...this.rateLimitConfig };
  }

  /**
   * Update rate limit config
   */
  setRateLimitConfig(config: Partial<RateLimitConfig>): void {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...config };
  }

  /**
   * Get authenticated client count
   */
  getAuthenticatedCount(): number {
    return this.clients.size;
  }

  /**
   * Get all authenticated clients
   */
  getAuthenticatedClients(): ClientIdentity[] {
    return Array.from(this.clients.values());
  }

  /**
   * Clean up expired tokens and clients
   */
  cleanup(): { tokens: number; clients: number } {
    const now = new Date();
    let tokensRemoved = 0;
    let clientsRemoved = 0;

    // Clean expired tokens
    for (const [hash, info] of this.tokens) {
      if (info.expiresAt && info.expiresAt < now) {
        this.tokens.delete(hash);
        tokensRemoved++;
      }
    }

    // Clean expired clients
    for (const [clientId, identity] of this.clients) {
      if (identity.expiresAt && identity.expiresAt < now) {
        this.clients.delete(clientId);
        this.rateLimits.delete(clientId);
        clientsRemoved++;
      }
    }

    if (tokensRemoved > 0 || clientsRemoved > 0) {
      log.debug('Auth cleanup completed', { tokensRemoved, clientsRemoved });
    }

    return { tokens: tokensRemoved, clients: clientsRemoved };
  }

  /**
   * Clear all authentication state
   */
  clear(): void {
    this.tokens.clear();
    this.clients.clear();
    this.rateLimits.clear();
  }
}

// Global auth manager instance
let globalAuthManager: AuthManager | null = null;

/**
 * Get the global auth manager
 */
export function getAuthManager(): AuthManager {
  if (!globalAuthManager) {
    globalAuthManager = new AuthManager();
  }
  return globalAuthManager;
}

/**
 * Initialize the auth manager with options
 */
export function initAuthManager(options: { rateLimitConfig?: RateLimitConfig } = {}): AuthManager {
  globalAuthManager = new AuthManager(options);
  return globalAuthManager;
}
