/**
 * Tests for event system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, GatewayEventType, initEventBus } from './events.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus({ maxHistorySize: 100 });
  });

  describe('subscribe', () => {
    it('should add subscription', () => {
      const callback = vi.fn();
      eventBus.subscribe(GatewayEventType.CLIENT_CONNECTED, callback);
      expect(eventBus.getSubscriptionCount(GatewayEventType.CLIENT_CONNECTED)).toBe(1);
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe(GatewayEventType.CLIENT_CONNECTED, callback);

      expect(eventBus.getSubscriptionCount(GatewayEventType.CLIENT_CONNECTED)).toBe(1);

      unsubscribe();

      expect(eventBus.getSubscriptionCount(GatewayEventType.CLIENT_CONNECTED)).toBe(0);
    });

    it('should support multiple subscriptions to same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.subscribe(GatewayEventType.CLIENT_CONNECTED, callback1);
      eventBus.subscribe(GatewayEventType.CLIENT_CONNECTED, callback2);

      expect(eventBus.getSubscriptionCount(GatewayEventType.CLIENT_CONNECTED)).toBe(2);
    });
  });

  describe('emit', () => {
    it('should call subscribed callbacks', async () => {
      const callback = vi.fn();
      eventBus.subscribe(GatewayEventType.CLIENT_CONNECTED, callback);

      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: '123' });

      expect(callback).toHaveBeenCalledWith({ clientId: '123' });
    });

    it('should call wildcard subscribers', async () => {
      const callback = vi.fn();
      eventBus.subscribe('*', callback);

      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: '123' });

      expect(callback).toHaveBeenCalledWith({ clientId: '123' });
    });

    it('should apply filter to subscriptions', async () => {
      const callback = vi.fn();
      eventBus.subscribe(
        GatewayEventType.CLIENT_CONNECTED,
        callback,
        (data: { clientId: string }) => data.clientId === 'allowed'
      );

      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: 'blocked' });
      expect(callback).not.toHaveBeenCalled();

      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: 'allowed' });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should persist events by default', async () => {
      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: '123' });

      const history = eventBus.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.type).toBe(GatewayEventType.CLIENT_CONNECTED);
    });

    it('should not persist events when disabled', async () => {
      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: '123' }, { persist: false });

      const history = eventBus.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('getHistory', () => {
    beforeEach(async () => {
      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: '1' }, { clientId: '1' });
      await eventBus.emit(GatewayEventType.CLIENT_DISCONNECTED, { clientId: '1' }, { clientId: '1' });
      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, { clientId: '2' }, { clientId: '2' });
    });

    it('should return all events', () => {
      const history = eventBus.getHistory();
      expect(history).toHaveLength(3);
    });

    it('should filter by event type', () => {
      const history = eventBus.getHistory({ eventType: GatewayEventType.CLIENT_CONNECTED });
      expect(history).toHaveLength(2);
    });

    it('should filter by client ID', () => {
      const history = eventBus.getHistory({ clientId: '1' });
      expect(history).toHaveLength(2);
    });

    it('should limit results', () => {
      const history = eventBus.getHistory({ limit: 2 });
      expect(history).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('should remove all subscriptions and history', async () => {
      const callback = vi.fn();
      eventBus.subscribe(GatewayEventType.CLIENT_CONNECTED, callback);
      await eventBus.emit(GatewayEventType.CLIENT_CONNECTED, {});

      eventBus.clear();

      expect(eventBus.getSubscriptionCount()).toBe(0);
      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe('maxHistorySize', () => {
    it('should trim history when exceeding max size', async () => {
      const smallBus = new EventBus({ maxHistorySize: 3 });

      await smallBus.emit(GatewayEventType.CLIENT_CONNECTED, { n: 1 });
      await smallBus.emit(GatewayEventType.CLIENT_CONNECTED, { n: 2 });
      await smallBus.emit(GatewayEventType.CLIENT_CONNECTED, { n: 3 });
      await smallBus.emit(GatewayEventType.CLIENT_CONNECTED, { n: 4 });

      const history = smallBus.getHistory();
      expect(history).toHaveLength(3);
      expect((history[0]?.data as { n: number }).n).toBe(2); // Oldest kept
    });
  });
});

describe('initEventBus', () => {
  it('should create global event bus', () => {
    const bus = initEventBus({ maxHistorySize: 50 });
    expect(bus).toBeInstanceOf(EventBus);
  });
});
