/**
 * Gateway event system
 */

import { createLogger } from '../logging/logger.js';
import type { EventCallback } from '../types/common.js';

const log = createLogger('events');

/**
 * Event types for the gateway
 */
export const GatewayEventType = {
  // Connection events
  CLIENT_CONNECTED: 'client.connected',
  CLIENT_DISCONNECTED: 'client.disconnected',
  CLIENT_AUTHENTICATED: 'client.authenticated',

  // Session events
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_ENDED: 'session.ended',
  SESSION_JOINED: 'session.joined',
  SESSION_LEFT: 'session.left',

  // Message events
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_ERROR: 'message.error',

  // Server events
  SERVER_STARTED: 'server.started',
  SERVER_STOPPED: 'server.stopped',
  SERVER_ERROR: 'server.error',

  // Loop events (for Ralph integration)
  LOOP_STARTED: 'loop.started',
  LOOP_ITERATION: 'loop.iteration',
  LOOP_COMPLETED: 'loop.completed',
  LOOP_FAILED: 'loop.failed',
  LOOP_PAUSED: 'loop.paused',
  LOOP_RESUMED: 'loop.resumed',

  // Channel events
  CHANNEL_MESSAGE: 'channel.message',
  CHANNEL_CONNECTED: 'channel.connected',
  CHANNEL_DISCONNECTED: 'channel.disconnected',
} as const;

export type GatewayEventTypeValue = typeof GatewayEventType[keyof typeof GatewayEventType];

/**
 * Event data types
 */
export interface ClientConnectedEvent {
  clientId: string;
  remoteAddress?: string;
  userAgent?: string;
}

export interface ClientDisconnectedEvent {
  clientId: string;
  reason?: string;
  code?: number;
}

export interface ClientAuthenticatedEvent {
  clientId: string;
  role: string;
}

export interface SessionCreatedEvent {
  sessionId: string;
  clientId: string;
  metadata?: Record<string, unknown>;
}

export interface SessionUpdatedEvent {
  sessionId: string;
  changes: Record<string, unknown>;
}

export interface SessionEndedEvent {
  sessionId: string;
  reason?: string;
}

export interface MessageReceivedEvent {
  clientId: string;
  messageId: string;
  messageType: string;
}

export interface MessageSentEvent {
  clientId: string;
  messageId: string;
  messageType: string;
}

export interface LoopIterationEvent {
  sessionId: string;
  iteration: number;
  storyId: string;
  status: 'started' | 'completed' | 'failed';
}

/**
 * Event entry for persistence
 */
export interface EventEntry {
  id: string;
  type: GatewayEventTypeValue;
  timestamp: Date;
  data: unknown;
  sessionId?: string;
  clientId?: string;
}

/**
 * Subscription info
 */
interface Subscription {
  id: string;
  eventType: string | '*';
  callback: EventCallback<unknown>;
  filter?: (data: unknown) => boolean;
}

/**
 * Event bus for internal event routing
 */
export class EventBus {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private eventHistory: EventEntry[] = [];
  private maxHistorySize: number;
  private nextSubscriptionId = 0;

  constructor(options: { maxHistorySize?: number } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 1000;
  }

  /**
   * Subscribe to an event type
   */
  subscribe<T = unknown>(
    eventType: GatewayEventTypeValue | '*',
    callback: EventCallback<T>,
    filter?: (data: T) => boolean
  ): () => void {
    const subscription: Subscription = {
      id: String(this.nextSubscriptionId++),
      eventType,
      callback: callback as EventCallback<unknown>,
      filter: filter as ((data: unknown) => boolean) | undefined,
    };

    const existing = this.subscriptions.get(eventType) ?? [];
    existing.push(subscription);
    this.subscriptions.set(eventType, existing);

    log.debug('Subscription added', { eventType, subscriptionId: subscription.id });

    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, subscription.id);
    };
  }

  /**
   * Unsubscribe from an event
   */
  private unsubscribe(eventType: string, subscriptionId: string): void {
    const existing = this.subscriptions.get(eventType);
    if (existing) {
      const filtered = existing.filter((s) => s.id !== subscriptionId);
      if (filtered.length > 0) {
        this.subscriptions.set(eventType, filtered);
      } else {
        this.subscriptions.delete(eventType);
      }
      log.debug('Subscription removed', { eventType, subscriptionId });
    }
  }

  /**
   * Emit an event
   */
  async emit<T = unknown>(
    eventType: GatewayEventTypeValue,
    data: T,
    options: { sessionId?: string; clientId?: string; persist?: boolean } = {}
  ): Promise<void> {
    const { sessionId, clientId, persist = true } = options;

    log.debug('Event emitted', { eventType, sessionId, clientId });

    // Persist event
    if (persist) {
      this.persistEvent(eventType, data, sessionId, clientId);
    }

    // Get subscribers for this event type and wildcard subscribers
    const specificSubscribers = this.subscriptions.get(eventType) ?? [];
    const wildcardSubscribers = this.subscriptions.get('*') ?? [];
    const allSubscribers = [...specificSubscribers, ...wildcardSubscribers];

    // Notify all subscribers
    const notifications = allSubscribers.map(async (subscription) => {
      try {
        // Apply filter if present
        if (subscription.filter && !subscription.filter(data)) {
          return;
        }

        await subscription.callback(data);
      } catch (error) {
        log.error('Error in event subscriber', error, {
          eventType,
          subscriptionId: subscription.id,
        });
      }
    });

    await Promise.all(notifications);
  }

  /**
   * Persist an event to history
   */
  private persistEvent(
    type: GatewayEventTypeValue,
    data: unknown,
    sessionId?: string,
    clientId?: string
  ): void {
    const entry: EventEntry = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type,
      timestamp: new Date(),
      data,
      sessionId,
      clientId,
    };

    this.eventHistory.push(entry);

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get event history
   */
  getHistory(options: {
    eventType?: GatewayEventTypeValue;
    sessionId?: string;
    clientId?: string;
    since?: Date;
    limit?: number;
  } = {}): EventEntry[] {
    let results = [...this.eventHistory];

    if (options.eventType) {
      results = results.filter((e) => e.type === options.eventType);
    }

    if (options.sessionId) {
      results = results.filter((e) => e.sessionId === options.sessionId);
    }

    if (options.clientId) {
      results = results.filter((e) => e.clientId === options.clientId);
    }

    if (options.since) {
      const since = options.since;
      results = results.filter((e) => e.timestamp >= since);
    }

    if (options.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(eventType?: string): number {
    if (eventType) {
      return this.subscriptions.get(eventType)?.length ?? 0;
    }

    let total = 0;
    for (const subs of this.subscriptions.values()) {
      total += subs.length;
    }
    return total;
  }

  /**
   * Remove all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
    this.eventHistory = [];
  }
}

// Global event bus instance
let globalEventBus: EventBus | null = null;

/**
 * Get the global event bus
 */
export function getEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * Initialize the event bus with options
 */
export function initEventBus(options: { maxHistorySize?: number } = {}): EventBus {
  globalEventBus = new EventBus(options);
  return globalEventBus;
}
