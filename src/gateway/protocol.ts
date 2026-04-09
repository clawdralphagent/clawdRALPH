/**
 * Gateway protocol utilities
 */

import { v4 as uuidv4 } from 'uuid';
import {
  MessageType,
  BaseMessageSchema,
  type GatewayMessage,
  type HelloMessage,
  type WelcomeMessage,
  type AuthRequest,
  type AuthResponse,
  type EventMessage,
  type RequestMessage,
  type ResponseMessage,
  type ErrorMessage,
  type PingMessage,
  type PongMessage,
  type ClientRole,
} from './types.js';

/**
 * Protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Create a timestamp string
 */
export function createTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Create a new message ID
 */
export function createMessageId(): string {
  return uuidv4();
}

/**
 * Create a hello message
 */
export function createHelloMessage(
  clientType: 'cli' | 'web' | 'node' | 'channel',
  capabilities?: string[]
): HelloMessage {
  return {
    id: createMessageId(),
    type: MessageType.HELLO,
    timestamp: createTimestamp(),
    payload: {
      version: PROTOCOL_VERSION,
      clientType,
      capabilities,
    },
  };
}

/**
 * Create a welcome message
 */
export function createWelcomeMessage(
  clientId: string,
  requiresAuth: boolean
): WelcomeMessage {
  return {
    id: createMessageId(),
    type: MessageType.WELCOME,
    timestamp: createTimestamp(),
    payload: {
      clientId,
      serverVersion: PROTOCOL_VERSION,
      requiresAuth,
    },
  };
}

/**
 * Create an auth request message
 */
export function createAuthRequest(token: string, role?: ClientRole): AuthRequest {
  return {
    id: createMessageId(),
    type: MessageType.AUTH_REQUEST,
    timestamp: createTimestamp(),
    payload: {
      token,
      role,
    },
  };
}

/**
 * Create an auth response message
 */
export function createAuthResponse(
  success: boolean,
  clientId: string,
  role: ClientRole,
  expiresAt?: string
): AuthResponse {
  return {
    id: createMessageId(),
    type: MessageType.AUTH_RESPONSE,
    timestamp: createTimestamp(),
    payload: {
      success,
      clientId,
      role,
      expiresAt,
    },
  };
}

/**
 * Create an event message
 */
export function createEventMessage(
  eventType: string,
  data: unknown,
  sessionId?: string
): EventMessage {
  return {
    id: createMessageId(),
    type: MessageType.EVENT,
    timestamp: createTimestamp(),
    payload: {
      eventType,
      sessionId,
      data,
    },
  };
}

/**
 * Create a request message
 */
export function createRequestMessage(
  method: string,
  params?: Record<string, unknown>
): RequestMessage {
  return {
    id: createMessageId(),
    type: MessageType.REQUEST,
    timestamp: createTimestamp(),
    payload: {
      method,
      params,
      correlationId: createMessageId(),
    },
  };
}

/**
 * Create a response message
 */
export function createResponseMessage(
  correlationId: string,
  success: boolean,
  data?: unknown,
  error?: { code: string; message: string; details?: unknown }
): ResponseMessage {
  return {
    id: createMessageId(),
    type: MessageType.RESPONSE,
    timestamp: createTimestamp(),
    payload: {
      correlationId,
      success,
      data,
      error,
    },
  };
}

/**
 * Create an error message
 */
export function createErrorMessage(
  code: string,
  message: string,
  details?: unknown,
  correlationId?: string
): ErrorMessage {
  return {
    id: createMessageId(),
    type: MessageType.ERROR,
    timestamp: createTimestamp(),
    payload: {
      code,
      message,
      details,
      correlationId,
    },
  };
}

/**
 * Create a ping message
 */
export function createPingMessage(): PingMessage {
  return {
    id: createMessageId(),
    type: MessageType.PING,
    timestamp: createTimestamp(),
  };
}

/**
 * Create a pong message
 */
export function createPongMessage(pingId: string): PongMessage {
  return {
    id: createMessageId(),
    type: MessageType.PONG,
    timestamp: createTimestamp(),
    payload: { pingId },
  };
}

/**
 * Serialize a message to JSON string
 */
export function serializeMessage(message: GatewayMessage): string {
  return JSON.stringify(message);
}

/**
 * Parse a message from JSON string
 */
export function parseMessage(data: string): { success: true; message: GatewayMessage } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(data) as unknown;

    // Validate base structure
    const baseResult = BaseMessageSchema.safeParse(parsed);
    if (!baseResult.success) {
      return { success: false, error: 'Invalid message structure' };
    }

    return { success: true, message: parsed as GatewayMessage };
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }
}

/**
 * Error codes
 */
export const ErrorCode = {
  // Connection errors
  CONNECTION_CLOSED: 'CONNECTION_CLOSED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',

  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',

  // Authorization errors
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',

  // Session errors
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS: 'SESSION_ALREADY_EXISTS',
  SESSION_ENDED: 'SESSION_ENDED',

  // Protocol errors
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  UNKNOWN_MESSAGE_TYPE: 'UNKNOWN_MESSAGE_TYPE',
  MISSING_CORRELATION_ID: 'MISSING_CORRELATION_ID',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode];
