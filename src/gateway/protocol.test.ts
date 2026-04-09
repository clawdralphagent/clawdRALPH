/**
 * Tests for protocol utilities
 */

import { describe, it, expect } from 'vitest';
import {
  createMessageId,
  createTimestamp,
  createHelloMessage,
  createWelcomeMessage,
  createAuthRequest,
  createAuthResponse,
  createEventMessage,
  createRequestMessage,
  createResponseMessage,
  createErrorMessage,
  serializeMessage,
  parseMessage,
  PROTOCOL_VERSION,
  ErrorCode,
} from './protocol.js';
import { MessageType } from './types.js';

describe('protocol utilities', () => {
  describe('createMessageId', () => {
    it('should create unique UUIDs', () => {
      const id1 = createMessageId();
      const id2 = createMessageId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('createTimestamp', () => {
    it('should create ISO timestamp', () => {
      const timestamp = createTimestamp();
      expect(() => new Date(timestamp)).not.toThrow();
    });
  });

  describe('createHelloMessage', () => {
    it('should create hello message', () => {
      const msg = createHelloMessage('cli', ['feature1']);

      expect(msg.type).toBe(MessageType.HELLO);
      expect(msg.payload.version).toBe(PROTOCOL_VERSION);
      expect(msg.payload.clientType).toBe('cli');
      expect(msg.payload.capabilities).toEqual(['feature1']);
    });
  });

  describe('createWelcomeMessage', () => {
    it('should create welcome message', () => {
      const msg = createWelcomeMessage('client-123', true);

      expect(msg.type).toBe(MessageType.WELCOME);
      expect(msg.payload.clientId).toBe('client-123');
      expect(msg.payload.requiresAuth).toBe(true);
      expect(msg.payload.serverVersion).toBe(PROTOCOL_VERSION);
    });
  });

  describe('createAuthRequest', () => {
    it('should create auth request', () => {
      const msg = createAuthRequest('my-token', 'admin');

      expect(msg.type).toBe(MessageType.AUTH_REQUEST);
      expect(msg.payload.token).toBe('my-token');
      expect(msg.payload.role).toBe('admin');
    });
  });

  describe('createAuthResponse', () => {
    it('should create success auth response', () => {
      const msg = createAuthResponse(true, 'client-123', 'user');

      expect(msg.type).toBe(MessageType.AUTH_RESPONSE);
      expect(msg.payload.success).toBe(true);
      expect(msg.payload.clientId).toBe('client-123');
      expect(msg.payload.role).toBe('user');
    });

    it('should include expiration', () => {
      const expires = new Date().toISOString();
      const msg = createAuthResponse(true, 'client-123', 'user', expires);

      expect(msg.payload.expiresAt).toBe(expires);
    });
  });

  describe('createEventMessage', () => {
    it('should create event message', () => {
      const msg = createEventMessage('user.created', { userId: '123' }, 'session-456');

      expect(msg.type).toBe(MessageType.EVENT);
      expect(msg.payload.eventType).toBe('user.created');
      expect(msg.payload.data).toEqual({ userId: '123' });
      expect(msg.payload.sessionId).toBe('session-456');
    });
  });

  describe('createRequestMessage', () => {
    it('should create request message', () => {
      const msg = createRequestMessage('session.create', { name: 'test' });

      expect(msg.type).toBe(MessageType.REQUEST);
      expect(msg.payload.method).toBe('session.create');
      expect(msg.payload.params).toEqual({ name: 'test' });
      expect(msg.payload.correlationId).toBeDefined();
    });
  });

  describe('createResponseMessage', () => {
    it('should create success response', () => {
      const msg = createResponseMessage('corr-123', true, { id: 'new-123' });

      expect(msg.type).toBe(MessageType.RESPONSE);
      expect(msg.payload.correlationId).toBe('corr-123');
      expect(msg.payload.success).toBe(true);
      expect(msg.payload.data).toEqual({ id: 'new-123' });
    });

    it('should create error response', () => {
      const msg = createResponseMessage('corr-123', false, undefined, {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });

      expect(msg.payload.success).toBe(false);
      expect(msg.payload.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('createErrorMessage', () => {
    it('should create error message', () => {
      const msg = createErrorMessage(ErrorCode.AUTH_FAILED, 'Invalid token');

      expect(msg.type).toBe(MessageType.ERROR);
      expect(msg.payload.code).toBe(ErrorCode.AUTH_FAILED);
      expect(msg.payload.message).toBe('Invalid token');
    });

    it('should include correlation ID', () => {
      const msg = createErrorMessage(ErrorCode.AUTH_FAILED, 'Error', undefined, 'corr-123');

      expect(msg.payload.correlationId).toBe('corr-123');
    });
  });

  describe('serializeMessage', () => {
    it('should serialize message to JSON', () => {
      const msg = createHelloMessage('cli');
      const serialized = serializeMessage(msg);

      expect(typeof serialized).toBe('string');
      expect(() => JSON.parse(serialized)).not.toThrow();
    });
  });

  describe('parseMessage', () => {
    it('should parse valid message', () => {
      const msg = createHelloMessage('cli');
      const serialized = serializeMessage(msg);

      const result = parseMessage(serialized);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message.type).toBe(MessageType.HELLO);
      }
    });

    it('should fail on invalid JSON', () => {
      const result = parseMessage('not valid json');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid JSON');
      }
    });

    it('should fail on invalid message structure', () => {
      const result = parseMessage('{"foo": "bar"}');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid message structure');
      }
    });
  });
});

describe('ErrorCode', () => {
  it('should have all error codes defined', () => {
    expect(ErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
    expect(ErrorCode.AUTH_FAILED).toBe('AUTH_FAILED');
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ErrorCode.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND');
    expect(ErrorCode.INVALID_MESSAGE).toBe('INVALID_MESSAGE');
  });
});
