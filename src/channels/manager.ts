/**
 * Channel manager - orchestrates all messaging channels
 */

import { createLogger } from '../logging/logger.js';
import { getConfig } from '../config/loader.js';
import { getEventBus, GatewayEventType } from '../gateway/events.js';
import { createTelegramChannel } from './telegram.js';
import { createDiscordChannel } from './discord.js';
import { createSignalChannel } from './signal.js';
import type {
  Channel,
  ChannelType,
  ChannelMessage,
  ChannelStatus,
  OutgoingMessage,
  SendResult,
  MessageCallback,
} from './types.js';

const log = createLogger('channel-manager');

/**
 * Channel manager options
 */
export interface ChannelManagerOptions {
  autoConnect?: boolean;
}

/**
 * Channel manager class
 */
export class ChannelManager {
  private channels: Map<ChannelType, Channel> = new Map();
  private messageCallbacks: Set<MessageCallback> = new Set();
  private isInitialized = false;

  constructor(options: ChannelManagerOptions = {}) {
    if (options.autoConnect) {
      void this.initializeChannels();
    }
  }

  /**
   * Initialize channels from configuration
   */
  async initializeChannels(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const config = getConfig();

    // Initialize Telegram if enabled
    if (config.channels.telegram.enabled && config.channels.telegram.token) {
      try {
        const telegram = createTelegramChannel(config.channels.telegram);
        this.channels.set('telegram', telegram);
        this.setupChannelCallbacks(telegram);
        log.info('Telegram channel initialized');
      } catch (error) {
        log.error('Failed to initialize Telegram channel', error);
      }
    }

    // Initialize Discord if enabled
    if (config.channels.discord.enabled && config.channels.discord.token) {
      try {
        const discord = createDiscordChannel(config.channels.discord);
        this.channels.set('discord', discord);
        this.setupChannelCallbacks(discord);
        log.info('Discord channel initialized');
      } catch (error) {
        log.error('Failed to initialize Discord channel', error);
      }
    }

    // Initialize Signal if enabled
    if (config.channels.signal.enabled && config.channels.signal.phoneNumber) {
      try {
        const signal = createSignalChannel(config.channels.signal);
        this.channels.set('signal', signal);
        this.setupChannelCallbacks(signal);
        log.info('Signal channel initialized');
      } catch (error) {
        log.error('Failed to initialize Signal channel', error);
      }
    }

    this.isInitialized = true;
    log.info('Channel manager initialized', { channels: Array.from(this.channels.keys()) });
  }

  /**
   * Set up message callbacks for a channel
   */
  private setupChannelCallbacks(channel: Channel): void {
    channel.onMessage(async (message) => {
      await this.handleIncomingMessage(message);
    });
  }

  /**
   * Handle incoming message from any channel
   */
  private async handleIncomingMessage(message: ChannelMessage): Promise<void> {
    log.debug('Received message', {
      channel: message.channelType,
      chatId: message.chatId,
      senderId: message.senderId,
      contentLength: message.content.length,
    });

    // Emit to gateway event bus
    await getEventBus().emit(GatewayEventType.CHANNEL_MESSAGE, {
      channelType: message.channelType,
      chatId: message.chatId,
      senderId: message.senderId,
      senderName: message.senderName,
      content: message.content,
      timestamp: message.timestamp,
      messageId: message.id,
    });

    // Notify all local callbacks
    for (const callback of this.messageCallbacks) {
      try {
        await callback(message);
      } catch (error) {
        log.error('Error in message callback', error);
      }
    }
  }

  /**
   * Connect all initialized channels
   */
  async connectAll(): Promise<Map<ChannelType, boolean>> {
    const results = new Map<ChannelType, boolean>();

    for (const [type, channel] of this.channels) {
      try {
        await channel.connect();
        results.set(type, true);
        log.info('Channel connected', { type });

        // Emit connected event
        await getEventBus().emit(GatewayEventType.CHANNEL_CONNECTED, {
          channelType: type,
        });
      } catch (error) {
        results.set(type, false);
        log.error('Failed to connect channel', error, { type });
      }
    }

    return results;
  }

  /**
   * Disconnect all channels
   */
  async disconnectAll(): Promise<void> {
    for (const [type, channel] of this.channels) {
      try {
        await channel.disconnect();
        log.info('Channel disconnected', { type });

        // Emit disconnected event
        await getEventBus().emit(GatewayEventType.CHANNEL_DISCONNECTED, {
          channelType: type,
        });
      } catch (error) {
        log.error('Error disconnecting channel', error, { type });
      }
    }
  }

  /**
   * Connect a specific channel
   */
  async connect(type: ChannelType): Promise<boolean> {
    const channel = this.channels.get(type);
    if (!channel) {
      log.warn('Channel not found', { type });
      return false;
    }

    try {
      await channel.connect();
      await getEventBus().emit(GatewayEventType.CHANNEL_CONNECTED, {
        channelType: type,
      });
      return true;
    } catch (error) {
      log.error('Failed to connect channel', error, { type });
      return false;
    }
  }

  /**
   * Disconnect a specific channel
   */
  async disconnect(type: ChannelType): Promise<boolean> {
    const channel = this.channels.get(type);
    if (!channel) {
      return false;
    }

    try {
      await channel.disconnect();
      await getEventBus().emit(GatewayEventType.CHANNEL_DISCONNECTED, {
        channelType: type,
      });
      return true;
    } catch (error) {
      log.error('Error disconnecting channel', error, { type });
      return false;
    }
  }

  /**
   * Get a channel by type
   */
  getChannel(type: ChannelType): Channel | undefined {
    return this.channels.get(type);
  }

  /**
   * Get all channels
   */
  getAllChannels(): Map<ChannelType, Channel> {
    return new Map(this.channels);
  }

  /**
   * Get status of all channels
   */
  getStatus(): Map<ChannelType, ChannelStatus> {
    const status = new Map<ChannelType, ChannelStatus>();
    for (const [type, channel] of this.channels) {
      status.set(type, channel.getStatus());
    }
    return status;
  }

  /**
   * Send a message to a specific channel
   */
  async send(type: ChannelType, message: OutgoingMessage): Promise<SendResult> {
    const channel = this.channels.get(type);
    if (!channel) {
      return { success: false, error: 'Channel not found' };
    }

    const result = await channel.send(message);

    if (result.success) {
      await getEventBus().emit(GatewayEventType.MESSAGE_SENT, {
        channelType: type,
        chatId: message.chatId,
        messageId: result.messageId,
      });
    }

    return result;
  }

  /**
   * Reply to a message on a specific channel
   */
  async reply(type: ChannelType, originalMessageId: string, message: OutgoingMessage): Promise<SendResult> {
    const channel = this.channels.get(type);
    if (!channel) {
      return { success: false, error: 'Channel not found' };
    }

    return channel.reply(originalMessageId, message);
  }

  /**
   * Broadcast a message to all connected channels
   */
  async broadcast(message: Omit<OutgoingMessage, 'chatId'>, chatIds: Map<ChannelType, string>): Promise<Map<ChannelType, SendResult>> {
    const results = new Map<ChannelType, SendResult>();

    for (const [type, chatId] of chatIds) {
      const result = await this.send(type, { ...message, chatId });
      results.set(type, result);
    }

    return results;
  }

  /**
   * Subscribe to incoming messages from all channels
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => {
      this.messageCallbacks.delete(callback);
    };
  }

  /**
   * Add a channel manually
   */
  addChannel(type: ChannelType, channel: Channel): void {
    this.channels.set(type, channel);
    this.setupChannelCallbacks(channel);
    log.info('Channel added', { type });
  }

  /**
   * Remove a channel
   */
  async removeChannel(type: ChannelType): Promise<boolean> {
    const channel = this.channels.get(type);
    if (!channel) {
      return false;
    }

    try {
      await channel.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    this.channels.delete(type);
    log.info('Channel removed', { type });
    return true;
  }

  /**
   * Get enabled channel count
   */
  getChannelCount(): number {
    return this.channels.size;
  }

  /**
   * Get connected channel count
   */
  getConnectedCount(): number {
    let count = 0;
    for (const channel of this.channels.values()) {
      if (channel.getStatus().state === 'connected') {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if any channel is connected
   */
  hasConnectedChannels(): boolean {
    return this.getConnectedCount() > 0;
  }

  /**
   * Dispose the channel manager
   */
  async dispose(): Promise<void> {
    await this.disconnectAll();
    this.channels.clear();
    this.messageCallbacks.clear();
    this.isInitialized = false;
  }
}

// Global channel manager instance
let globalChannelManager: ChannelManager | null = null;

/**
 * Get the global channel manager
 */
export function getChannelManager(): ChannelManager {
  if (!globalChannelManager) {
    globalChannelManager = new ChannelManager();
  }
  return globalChannelManager;
}

/**
 * Initialize the channel manager with options
 */
export function initChannelManager(options: ChannelManagerOptions = {}): ChannelManager {
  if (globalChannelManager) {
    void globalChannelManager.dispose();
  }
  globalChannelManager = new ChannelManager(options);
  return globalChannelManager;
}
