/**
 * Telegram channel implementation using grammY
 */

import { Bot, Context } from 'grammy';
import { createLogger } from '../logging/logger.js';
import type { TelegramConfig } from '../types/config.js';
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

const log = createLogger('telegram');

/**
 * Telegram channel implementation
 */
export class TelegramChannel implements Channel {
  readonly type = 'telegram' as const;

  private bot: Bot | null = null;
  private config: TelegramConfig;
  private state: ChannelStatus['state'] = 'disconnected';
  private connectedAt?: Date;
  private lastActivity?: Date;
  private error?: string;
  private messageCallbacks: Set<MessageCallback> = new Set();
  private botInfo?: { id: number; username: string };

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  /**
   * Get current channel status
   */
  getStatus(): ChannelStatus {
    return {
      type: 'telegram',
      state: this.state,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      error: this.error,
      metadata: {
        botUsername: this.botInfo?.username,
        botId: this.botInfo?.id,
      },
    };
  }

  /**
   * Get channel capabilities
   */
  getCapabilities(): ChannelCapabilities {
    return {
      supportsMarkdown: true,
      supportsHtml: true,
      supportsThreads: true,
      supportsReactions: true,
      supportsEditing: true,
      supportsDeleting: true,
      supportsVoice: true,
      supportsVideo: true,
      maxMessageLength: 4096,
      maxAttachmentSize: 50 * 1024 * 1024, // 50MB
    };
  }

  /**
   * Connect to Telegram
   */
  async connect(): Promise<void> {
    if (!this.config.token) {
      throw new Error('Telegram bot token is required');
    }

    if (this.state === 'connected') {
      return;
    }

    this.state = 'connecting';
    this.error = undefined;

    try {
      this.bot = new Bot(this.config.token);

      // Get bot info
      const me = await this.bot.api.getMe();
      this.botInfo = { id: me.id, username: me.username ?? '' };

      // Set up message handler
      this.bot.on('message', async (ctx) => {
        await this.handleMessage(ctx);
      });

      // Set up error handler
      this.bot.catch((err) => {
        log.error('Telegram bot error', err);
        this.error = err.message;
      });

      // Start the bot
      this.bot.start({
        onStart: (botInfo) => {
          log.info('Telegram bot started', { username: botInfo.username });
        },
      });

      this.state = 'connected';
      this.connectedAt = new Date();
      log.info('Telegram channel connected', { username: this.botInfo.username });
    } catch (error) {
      this.state = 'error';
      this.error = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to connect Telegram channel', error);
      throw error;
    }
  }

  /**
   * Disconnect from Telegram
   */
  async disconnect(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
    this.state = 'disconnected';
    this.connectedAt = undefined;
    log.info('Telegram channel disconnected');
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(ctx: Context): Promise<void> {
    const message = ctx.message;
    if (!message || !message.text) return;

    const chatId = String(message.chat.id);
    const userId = String(message.from?.id ?? '');
    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
    const isDirect = message.chat.type === 'private';

    // Check if message type is allowed
    if (isGroup && !this.config.allowGroupMessages) {
      return;
    }

    if (isDirect && !this.config.allowDirectMessages) {
      return;
    }

    // Check if mention is required in groups
    if (isGroup && this.config.requireMention) {
      const botMention = `@${this.botInfo?.username}`;
      if (!message.text.includes(botMention)) {
        return;
      }
    }

    // Check allowlist/blocklist
    if (!this.isAllowed(chatId, userId)) {
      return;
    }

    this.lastActivity = new Date();

    // Convert to normalized message
    const normalizedMessage = this.normalizeMessage(ctx, message);

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
   * Normalize Telegram message to common format
   */
  private normalizeMessage(_ctx: Context, message: NonNullable<Context['message']>): ChannelMessage {
    const attachments: Attachment[] = [];

    // Handle photo
    if (message.photo && message.photo.length > 0) {
      const largestPhoto = message.photo[message.photo.length - 1]!;
      attachments.push({
        id: largestPhoto.file_id,
        type: 'image',
        size: largestPhoto.file_size,
      });
    }

    // Handle document
    if (message.document) {
      attachments.push({
        id: message.document.file_id,
        type: 'document',
        filename: message.document.file_name,
        mimeType: message.document.mime_type,
        size: message.document.file_size,
      });
    }

    // Handle voice
    if (message.voice) {
      attachments.push({
        id: message.voice.file_id,
        type: 'audio',
        mimeType: message.voice.mime_type,
        size: message.voice.file_size,
      });
    }

    // Handle video
    if (message.video) {
      attachments.push({
        id: message.video.file_id,
        type: 'video',
        mimeType: message.video.mime_type,
        size: message.video.file_size,
      });
    }

    // Handle sticker
    if (message.sticker) {
      attachments.push({
        id: message.sticker.file_id,
        type: 'sticker',
      });
    }

    const chatType = message.chat.type === 'private' ? 'direct' : 'group';

    // Remove bot mention from text if present
    let content = message.text ?? message.caption ?? '';
    if (this.botInfo?.username) {
      content = content.replace(new RegExp(`@${this.botInfo.username}\\s*`, 'gi'), '').trim();
    }

    return {
      id: String(message.message_id),
      channelType: 'telegram',
      channelId: 'telegram',
      chatId: String(message.chat.id),
      chatType,
      senderId: String(message.from?.id ?? ''),
      senderName: this.getSenderName(message),
      content,
      timestamp: new Date(message.date * 1000),
      replyToId: message.reply_to_message ? String(message.reply_to_message.message_id) : undefined,
      threadId: message.message_thread_id ? String(message.message_thread_id) : undefined,
      attachments,
      metadata: {
        chatTitle: 'title' in message.chat ? message.chat.title : undefined,
        isForwarded: 'forward_origin' in message,
      },
      raw: message,
    };
  }

  /**
   * Get sender display name
   */
  private getSenderName(message: NonNullable<Context['message']>): string {
    const from = message.from;
    if (!from) return 'Unknown';

    if (from.first_name && from.last_name) {
      return `${from.first_name} ${from.last_name}`;
    }
    return from.first_name || from.username || 'Unknown';
  }

  /**
   * Send a message
   */
  async send(message: OutgoingMessage): Promise<SendResult> {
    if (!this.bot || this.state !== 'connected') {
      return { success: false, error: 'Not connected' };
    }

    try {
      const parseMode = message.parseMode === 'html' ? 'HTML' :
                       message.parseMode === 'markdown' ? 'Markdown' : undefined;

      const result = await this.bot.api.sendMessage(
        message.chatId,
        message.content,
        {
          parse_mode: parseMode,
          reply_to_message_id: message.replyToId ? parseInt(message.replyToId, 10) : undefined,
          message_thread_id: message.threadId ? parseInt(message.threadId, 10) : undefined,
        }
      );

      this.lastActivity = new Date();

      return {
        success: true,
        messageId: String(result.message_id),
      };
    } catch (error) {
      log.error('Failed to send Telegram message', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
  isAllowed(chatId: string, userId?: string): boolean {
    // Check blocklist first
    if (this.config.blocklist.length > 0) {
      if (this.config.blocklist.includes(chatId)) return false;
      if (userId && this.config.blocklist.includes(userId)) return false;
    }

    // If allowlist is empty, allow all (that aren't blocked)
    if (this.config.allowlist.length === 0) {
      return true;
    }

    // Check allowlist
    if (this.config.allowlist.includes(chatId)) return true;
    if (userId && this.config.allowlist.includes(userId)) return true;

    return false;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TelegramConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a Telegram channel instance
 */
export function createTelegramChannel(config: TelegramConfig): TelegramChannel {
  return new TelegramChannel(config);
}
