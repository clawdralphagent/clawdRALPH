/**
 * Discord channel implementation using discord.js
 */

import {
  Client,
  GatewayIntentBits,
  Message,
  Partials,
  TextChannel,
  DMChannel,
  NewsChannel,
  ThreadChannel,
} from 'discord.js';
import { createLogger } from '../logging/logger.js';
import type { DiscordConfig } from '../types/config.js';
import type {
  Channel,
  ChannelMessage,
  ChannelStatus,
  ChannelCapabilities,
  OutgoingMessage,
  SendResult,
  MessageCallback,
  Attachment,
} from './types.js';

const log = createLogger('discord');

type TextBasedChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

/**
 * Discord channel implementation
 */
export class DiscordChannel implements Channel {
  readonly type = 'discord' as const;

  private client: Client | null = null;
  private config: DiscordConfig;
  private state: ChannelStatus['state'] = 'disconnected';
  private connectedAt?: Date;
  private lastActivity?: Date;
  private error?: string;
  private messageCallbacks: Set<MessageCallback> = new Set();
  private botInfo?: { id: string; username: string; discriminator: string };

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  /**
   * Get current channel status
   */
  getStatus(): ChannelStatus {
    return {
      type: 'discord',
      state: this.state,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      error: this.error,
      metadata: {
        botUsername: this.botInfo?.username,
        botId: this.botInfo?.id,
        guilds: this.client?.guilds.cache.size ?? 0,
      },
    };
  }

  /**
   * Get channel capabilities
   */
  getCapabilities(): ChannelCapabilities {
    return {
      supportsMarkdown: true,
      supportsHtml: false,
      supportsThreads: true,
      supportsReactions: true,
      supportsEditing: true,
      supportsDeleting: true,
      supportsVoice: true,
      supportsVideo: true,
      maxMessageLength: 2000,
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB for non-nitro
    };
  }

  /**
   * Connect to Discord
   */
  async connect(): Promise<void> {
    if (!this.config.token) {
      throw new Error('Discord bot token is required');
    }

    if (this.state === 'connected') {
      return;
    }

    this.state = 'connecting';
    this.error = undefined;

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Channel, Partials.Message],
      });

      // Set up ready handler
      this.client.once('ready', () => {
        if (this.client?.user) {
          this.botInfo = {
            id: this.client.user.id,
            username: this.client.user.username,
            discriminator: this.client.user.discriminator,
          };
          log.info('Discord bot ready', {
            username: this.botInfo.username,
            guilds: this.client.guilds.cache.size,
          });
        }
        this.state = 'connected';
        this.connectedAt = new Date();
      });

      // Set up message handler
      this.client.on('messageCreate', async (message) => {
        await this.handleMessage(message);
      });

      // Set up error handler
      this.client.on('error', (error) => {
        log.error('Discord client error', error);
        this.error = error.message;
      });

      // Login
      await this.client.login(this.config.token);

      log.info('Discord channel connecting...');
    } catch (error) {
      this.state = 'error';
      this.error = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to connect Discord channel', error);
      throw error;
    }
  }

  /**
   * Disconnect from Discord
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.state = 'disconnected';
    this.connectedAt = undefined;
    log.info('Discord channel disconnected');
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    const isDM = !message.guild;
    const chatId = message.channel.id;
    const userId = message.author.id;
    const guildId = message.guild?.id;

    // Check if message type is allowed
    if (isDM && !this.config.allowDirectMessages) {
      return;
    }

    if (!isDM && !this.config.allowServerMessages) {
      return;
    }

    // Check if mention is required in servers
    if (!isDM && this.config.requireMention) {
      const isMentioned = message.mentions.users.has(this.client?.user?.id ?? '');
      if (!isMentioned) {
        return;
      }
    }

    // Check allowlist/blocklist
    if (!this.isAllowed(chatId, userId, guildId)) {
      return;
    }

    this.lastActivity = new Date();

    // Convert to normalized message
    const normalizedMessage = this.normalizeMessage(message);

    // Notify all callbacks
    for (const callback of this.messageCallbacks) {
      try {
        await callback(normalizedMessage);
      } catch (error) {
        log.error('Error in message callback', error);
      }
    }
  }

  /**
   * Normalize Discord message to common format
   */
  private normalizeMessage(message: Message): ChannelMessage {
    const attachments: Attachment[] = [];

    // Handle attachments
    for (const [, attachment] of message.attachments) {
      let type: Attachment['type'] = 'other';
      if (attachment.contentType?.startsWith('image/')) type = 'image';
      else if (attachment.contentType?.startsWith('video/')) type = 'video';
      else if (attachment.contentType?.startsWith('audio/')) type = 'audio';
      else type = 'document';

      attachments.push({
        id: attachment.id,
        type,
        filename: attachment.name ?? undefined,
        mimeType: attachment.contentType ?? undefined,
        size: attachment.size,
        url: attachment.url,
      });
    }

    const isDM = !message.guild;
    const chatType = isDM ? 'direct' : 'group';

    // Remove bot mention from content
    let content = message.content;
    if (this.client?.user) {
      content = content.replace(new RegExp(`<@!?${this.client.user.id}>\\s*`, 'g'), '').trim();
    }

    return {
      id: message.id,
      channelType: 'discord',
      channelId: 'discord',
      chatId: message.channel.id,
      chatType,
      senderId: message.author.id,
      senderName: message.author.displayName || message.author.username,
      content,
      timestamp: message.createdAt,
      replyToId: message.reference?.messageId ?? undefined,
      threadId: message.thread?.id,
      attachments,
      metadata: {
        guildId: message.guild?.id,
        guildName: message.guild?.name,
        channelName: 'name' in message.channel ? message.channel.name : 'DM',
        isThread: message.channel.isThread(),
      },
      raw: message,
    };
  }

  /**
   * Send a message
   */
  async send(message: OutgoingMessage): Promise<SendResult> {
    if (!this.client || this.state !== 'connected') {
      return { success: false, error: 'Not connected' };
    }

    try {
      const channel = await this.client.channels.fetch(message.chatId);

      if (!channel || !this.isTextBasedChannel(channel)) {
        return { success: false, error: 'Invalid channel' };
      }

      const result = await channel.send({
        content: message.content,
        reply: message.replyToId ? { messageReference: message.replyToId } : undefined,
      });

      this.lastActivity = new Date();

      return {
        success: true,
        messageId: result.id,
      };
    } catch (error) {
      log.error('Failed to send Discord message', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Type guard for text-based channels
   */
  private isTextBasedChannel(channel: unknown): channel is TextBasedChannel {
    return channel !== null &&
           typeof channel === 'object' &&
           'send' in channel &&
           typeof (channel as TextBasedChannel).send === 'function';
  }

  /**
   * Reply to a message
   */
  async reply(originalMessageId: string, message: OutgoingMessage): Promise<SendResult> {
    return this.send({
      ...message,
      replyToId: originalMessageId,
    });
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => {
      this.messageCallbacks.delete(callback);
    };
  }

  /**
   * Check if a chat/user is allowed
   */
  isAllowed(chatId: string, userId?: string, guildId?: string): boolean {
    // Check blocklist first
    if (this.config.blocklist.length > 0) {
      if (this.config.blocklist.includes(chatId)) return false;
      if (userId && this.config.blocklist.includes(userId)) return false;
      if (guildId && this.config.blocklist.includes(guildId)) return false;
    }

    // If allowlist is empty, allow all (that aren't blocked)
    if (this.config.allowlist.length === 0) {
      return true;
    }

    // Check allowlist
    if (this.config.allowlist.includes(chatId)) return true;
    if (userId && this.config.allowlist.includes(userId)) return true;
    if (guildId && this.config.allowlist.includes(guildId)) return true;

    return false;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DiscordConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a Discord channel instance
 */
export function createDiscordChannel(config: DiscordConfig): DiscordChannel {
  return new DiscordChannel(config);
}
