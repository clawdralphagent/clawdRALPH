/**
 * Tests for authentication system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthManager } from './auth.js';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager({
      rateLimitConfig: {
        windowMs: 1000,
        maxRequests: 10,
      },
    });
  });

  describe('generateToken', () => {
    it('should generate unique tokens', () => {
      const token1 = authManager.generateToken();
      const token2 = authManager.generateToken();

      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
    });
  });

  describe('registerToken', () => {
    it('should register a token', () => {
      const token = authManager.generateToken();
      authManager.registerToken(token, 'admin');

      const info = authManager.validateToken(token);
      expect(info).not.toBeNull();
      expect(info?.role).toBe('admin');
    });

    it('should handle token expiration', () => {
      const token = authManager.generateToken();
      const pastDate = new Date(Date.now() - 1000);
      authManager.registerToken(token, 'user', pastDate);

      const info = authManager.validateToken(token);
      expect(info).toBeNull();
    });
  });

  describe('revokeToken', () => {
    it('should revoke an existing token', () => {
      const token = authManager.generateToken();
      authManager.registerToken(token, 'admin');

      expect(authManager.validateToken(token)).not.toBeNull();

      const revoked = authManager.revokeToken(token);
      expect(revoked).toBe(true);

      expect(authManager.validateToken(token)).toBeNull();
    });

    it('should return false for non-existent token', () => {
      const revoked = authManager.revokeToken('non-existent');
      expect(revoked).toBe(false);
    });
  });

  describe('authenticate', () => {
    it('should authenticate with valid token', () => {
      const token = authManager.generateToken();
      authManager.registerToken(token, 'user');

      const result = authManager.authenticate('client-1', token);

      expect(result.success).toBe(true);
      expect(result.identity?.id).toBe('client-1');
      expect(result.identity?.role).toBe('user');
    });

    it('should fail with invalid token', () => {
      const result = authManager.authenticate('client-1', 'invalid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail with expired token', () => {
      const token = authManager.generateToken();
      const pastDate = new Date(Date.now() - 1000);
      authManager.registerToken(token, 'user', pastDate);

      const result = authManager.authenticate('client-1', token);

      expect(result.success).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should return true for authenticated client', () => {
      const token = authManager.generateToken();
      authManager.registerToken(token, 'user');
      authManager.authenticate('client-1', token);

      expect(authManager.isAuthenticated('client-1')).toBe(true);
    });

    it('should return false for unauthenticated client', () => {
      expect(authManager.isAuthenticated('client-1')).toBe(false);
    });
  });

  describe('hasRole', () => {
    beforeEach(() => {
      const adminToken = authManager.generateToken();
      const userToken = authManager.generateToken();
      const viewerToken = authManager.generateToken();

      authManager.registerToken(adminToken, 'admin');
      authManager.registerToken(userToken, 'user');
      authManager.registerToken(viewerToken, 'viewer');

      authManager.authenticate('admin-client', adminToken);
      authManager.authenticate('user-client', userToken);
      authManager.authenticate('viewer-client', viewerToken);
    });

    it('should allow admin to have all roles', () => {
      expect(authManager.hasRole('admin-client', 'admin')).toBe(true);
      expect(authManager.hasRole('admin-client', 'user')).toBe(true);
      expect(authManager.hasRole('admin-client', 'viewer')).toBe(true);
    });

    it('should allow user to have user and lower roles', () => {
      expect(authManager.hasRole('user-client', 'admin')).toBe(false);
      expect(authManager.hasRole('user-client', 'user')).toBe(true);
      expect(authManager.hasRole('user-client', 'viewer')).toBe(true);
    });

    it('should only allow viewer to have viewer role', () => {
      expect(authManager.hasRole('viewer-client', 'admin')).toBe(false);
      expect(authManager.hasRole('viewer-client', 'user')).toBe(false);
      expect(authManager.hasRole('viewer-client', 'viewer')).toBe(true);
    });
  });

  describe('authorize', () => {
    beforeEach(() => {
      const adminToken = authManager.generateToken();
      const userToken = authManager.generateToken();

      authManager.registerToken(adminToken, 'admin');
      authManager.registerToken(userToken, 'user');

      authManager.authenticate('admin-client', adminToken);
      authManager.authenticate('user-client', userToken);
    });

    it('should authorize admin for admin actions', () => {
      expect(authManager.authorize('admin-client', 'admin.config')).toBe(true);
      expect(authManager.authorize('user-client', 'admin.config')).toBe(false);
    });

    it('should authorize user for session actions', () => {
      expect(authManager.authorize('user-client', 'session.create')).toBe(true);
      expect(authManager.authorize('user-client', 'session.delete')).toBe(false);
    });

    it('should deny unknown actions', () => {
      expect(authManager.authorize('admin-client', 'unknown.action')).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      for (let i = 0; i < 10; i++) {
        const result = authManager.checkRateLimit('client-1');
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      for (let i = 0; i < 10; i++) {
        authManager.checkRateLimit('client-1');
      }

      const result = authManager.checkRateLimit('client-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track remaining requests', () => {
      const result1 = authManager.checkRateLimit('client-1');
      expect(result1.remaining).toBe(9);

      const result2 = authManager.checkRateLimit('client-1');
      expect(result2.remaining).toBe(8);
    });

    it('should track different clients separately', () => {
      for (let i = 0; i < 10; i++) {
        authManager.checkRateLimit('client-1');
      }

      const result1 = authManager.checkRateLimit('client-1');
      expect(result1.allowed).toBe(false);

      const result2 = authManager.checkRateLimit('client-2');
      expect(result2.allowed).toBe(true);
    });
  });

  describe('deauthenticate', () => {
    it('should remove client authentication', () => {
      const token = authManager.generateToken();
      authManager.registerToken(token, 'user');
      authManager.authenticate('client-1', token);

      expect(authManager.isAuthenticated('client-1')).toBe(true);

      authManager.deauthenticate('client-1');

      expect(authManager.isAuthenticated('client-1')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove expired tokens and clients', () => {
      const validToken = authManager.generateToken();
      const expiredToken = authManager.generateToken();

      authManager.registerToken(validToken, 'admin');
      authManager.registerToken(expiredToken, 'user', new Date(Date.now() - 1000));

      authManager.authenticate('valid-client', validToken);

      const result = authManager.cleanup();

      expect(result.tokens).toBe(1); // Expired token removed
      expect(authManager.validateToken(validToken)).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all state', () => {
      const token = authManager.generateToken();
      authManager.registerToken(token, 'admin');
      authManager.authenticate('client-1', token);

      authManager.clear();

      expect(authManager.validateToken(token)).toBeNull();
      expect(authManager.isAuthenticated('client-1')).toBe(false);
    });
  });
});
