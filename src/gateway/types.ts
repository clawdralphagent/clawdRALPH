/**
 * Gateway type definitions
 */

import { z } from 'zod';

/**
 * Client connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'authenticated' | 'disconnecting' | 'disconnected';

/**
 * Client role for authorization
 */
export type ClientRole = 'admin' | 'user' | 'channel' | 'node' | 'viewer';

/**
 * Client information
 */
export interface ClientInfo {
  id: string;
  role: ClientRole;
  name?: string;
  connectedAt: Date;
  lastActivity: Date;
  metadata: Record<string, unknown>;
}

/**
 * Connection metadata
 */
export interface ConnectionMeta {
  clientId: string;
  state: ConnectionState;
  authenticated: boolean;
  role: ClientRole;
  remoteAddress?: string;
  userAgent?: string;
  connectedAt: Date;
  lastPing?: Date;
  lastPong?: Date;
  missedPings: number;
}

/**
 * Session state
 */
export type SessionState = 'active' | 'paused' | 'completed' | 'failed';

/**
 * Session information
 */
export interface SessionInfo {
  id: string;
  clientId: string;
  state: SessionState;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Gateway statistics
 */
export interface GatewayStats {
  uptime: number;
  connections: {
    total: number;
    authenticated: number;
    byRole: Record<ClientRole, number>;
  };
  sessions: {
    active: number;
    total: number;
  };
  messages: {
    received: number;
    sent: number;
    errors: number;
  };
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Rate limit state per client
 */
export interface RateLimitState {
  requests: number;
  windowStart: number;
}

/**
 * Message type enumeration
 */
export const MessageType = {
  // Connection lifecycle
  HELLO: 'hello',
  WELCOME: 'welcome',
  PING: 'ping',
  PONG: 'pong',
  GOODBYE: 'goodbye',

  // Authentication
  AUTH_REQUEST: 'auth.request',
  AUTH_RESPONSE: 'auth.response',
  AUTH_ERROR: 'auth.error',

  // Session management
  SESSION_CREATE: 'session.create',
  SESSION_CREATED: 'session.created',
  SESSION_JOIN: 'session.join',
  SESSION_JOINED: 'session.joined',
  SESSION_LEAVE: 'session.leave',
  SESSION_LEFT: 'session.left',
  SESSION_UPDATE: 'session.update',
  SESSION_END: 'session.end',

  // Events
  EVENT: 'event',
  EVENT_ACK: 'event.ack',

  // Requests/Responses
  REQUEST: 'request',
  RESPONSE: 'response',
  ERROR: 'error',

  // Subscriptions
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',

  // Streaming
  STREAM_START: 'stream.start',
  STREAM_DATA: 'stream.data',
  STREAM_END: 'stream.end',
  STREAM_ERROR: 'stream.error',
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType];

/**
 * Base message schema
 */
export const BaseMessageSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * Hello message (client -> server)
 */
export const HelloMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.HELLO),
  payload: z.object({
    version: z.string(),
    clientType: z.enum(['cli', 'web', 'node', 'channel']),
    capabilities: z.array(z.string()).optional(),
  }),
});

/**
 * Welcome message (server -> client)
 */
export const WelcomeMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.WELCOME),
  payload: z.object({
    clientId: z.string().uuid(),
    serverVersion: z.string(),
    requiresAuth: z.boolean(),
  }),
});

/**
 * Auth request message
 */
export const AuthRequestSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.AUTH_REQUEST),
  payload: z.object({
    token: z.string(),
    role: z.enum(['admin', 'user', 'channel', 'node', 'viewer']).optional(),
  }),
});

/**
 * Auth response message
 */
export const AuthResponseSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.AUTH_RESPONSE),
  payload: z.object({
    success: z.boolean(),
    clientId: z.string().uuid(),
    role: z.enum(['admin', 'user', 'channel', 'node', 'viewer']),
    expiresAt: z.string().datetime().optional(),
  }),
});

/**
 * Generic event message
 */
export const EventMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.EVENT),
  payload: z.object({
    eventType: z.string(),
    sessionId: z.string().uuid().optional(),
    data: z.unknown(),
  }),
});

/**
 * Request message
 */
export const RequestMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.REQUEST),
  payload: z.object({
    method: z.string(),
    params: z.record(z.unknown()).optional(),
    correlationId: z.string().uuid(),
  }),
});

/**
 * Response message
 */
export const ResponseMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.RESPONSE),
  payload: z.object({
    correlationId: z.string().uuid(),
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }).optional(),
  }),
});

/**
 * Error message
 */
export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.ERROR),
  payload: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    correlationId: z.string().uuid().optional(),
  }),
});

/**
 * Ping message (client -> server or server -> client)
 */
export const PingMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.PING),
});

/**
 * Pong message (response to ping)
 */
export const PongMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.PONG),
  payload: z.object({
    pingId: z.string().uuid(),
  }),
});

// Type exports
export type BaseMessage = z.infer<typeof BaseMessageSchema>;
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;
export type AuthRequest = z.infer<typeof AuthRequestSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type EventMessage = z.infer<typeof EventMessageSchema>;
export type RequestMessage = z.infer<typeof RequestMessageSchema>;
export type ResponseMessage = z.infer<typeof ResponseMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;

/**
 * Union of all message types
 */
export type GatewayMessage =
  | HelloMessage
  | WelcomeMessage
  | AuthRequest
  | AuthResponse
  | EventMessage
  | RequestMessage
  | ResponseMessage
  | ErrorMessage
  | PingMessage
  | PongMessage;
