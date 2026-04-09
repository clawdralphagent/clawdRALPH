/**
 * Channel abstraction types
 */

import { z } from 'zod';

/**
 * Supported channel types
 */
export type ChannelType = 'telegram' | 'discord' | 'signal';

/**
 * Channel connection state
 */
export type ChannelState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Normalized message from any channel
 */
export interface ChannelMessage {
  id: string;
  channelType: ChannelType;
  channelId: string;
  chatId: string;
  chatType: 'direct' | 'group' | 'channel';
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  replyToId?: string;
  threadId?: string;
  attachments: Attachment[];
  metadata: Record<string, unknown>;
  raw: unknown;
}

/**
 * Attachment in a message
 */
export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other';
  filename?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  data?: Buffer;
}

/**
 * Outgoing message to send
 */
export interface OutgoingMessage {
  chatId: string;
  content: string;
  replyToId?: string;
  threadId?: string;
  attachments?: OutgoingAttachment[];
  parseMode?: 'text' | 'markdown' | 'html';
}

/**
 * Outgoing attachment
 */
export interface OutgoingAttachment {
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  data: Buffer | string;
  mimeType?: string;
}

/**
 * Message send result
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Channel capabilities
 */
export interface ChannelCapabilities {
  supportsMarkdown: boolean;
  supportsHtml: boolean;
  supportsThreads: boolean;
  supportsReactions: boolean;
  supportsEditing: boolean;
  supportsDeleting: boolean;
  supportsVoice: boolean;
  supportsVideo: boolean;
  maxMessageLength: number;
  maxAttachmentSize: number;
}

/**
 * Channel status info
 */
export interface ChannelStatus {
  type: ChannelType;
  state: ChannelState;
  connectedAt?: Date;
  lastActivity?: Date;
  error?: string;
  metadata: Record<string, unknown>;
}

/**
 * Channel event types
 */
export const ChannelEventType = {
  MESSAGE_RECEIVED: 'channel.message.received',
  MESSAGE_SENT: 'channel.message.sent',
  MESSAGE_EDITED: 'channel.message.edited',
  MESSAGE_DELETED: 'channel.message.deleted',
  CONNECTED: 'channel.connected',
  DISCONNECTED: 'channel.disconnected',
  ERROR: 'channel.error',
  REACTION_ADDED: 'channel.reaction.added',
  REACTION_REMOVED: 'channel.reaction.removed',
} as const;

export type ChannelEventTypeValue = typeof ChannelEventType[keyof typeof ChannelEventType];

/**
 * Channel message callback
 */
export type MessageCallback = (message: ChannelMessage) => void | Promise<void>;

/**
 * Channel interface - all channels must implement this
 */
export interface Channel {
  /** Channel type identifier */
  readonly type: ChannelType;

  /** Get current channel status */
  getStatus(): ChannelStatus;

  /** Get channel capabilities */
  getCapabilities(): ChannelCapabilities;

  /** Connect to the channel */
  connect(): Promise<void>;

  /** Disconnect from the channel */
  disconnect(): Promise<void>;

  /** Send a message */
  send(message: OutgoingMessage): Promise<SendResult>;

  /** Reply to a message */
  reply(originalMessageId: string, message: OutgoingMessage): Promise<SendResult>;

  /** Subscribe to incoming messages */
  onMessage(callback: MessageCallback): () => void;

  /** Check if a chat/user is allowed */
  isAllowed(chatId: string, userId?: string): boolean;
}

/**
 * Channel configuration schemas
 */
export const TelegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().optional(),
  allowedUsers: z.array(z.string()).default([]),
  allowedGroups: z.array(z.string()).default([]),
  allowDirectMessages: z.boolean().default(true),
  allowGroupMessages: z.boolean().default(false),
  requireMention: z.boolean().default(true),
});

export const DiscordConfigSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().optional(),
  applicationId: z.string().optional(),
  allowedUsers: z.array(z.string()).default([]),
  allowedServers: z.array(z.string()).default([]),
  allowedChannels: z.array(z.string()).default([]),
  allowDirectMessages: z.boolean().default(true),
  allowServerMessages: z.boolean().default(false),
  requireMention: z.boolean().default(true),
});

export const SignalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  phoneNumber: z.string().optional(),
  configPath: z.string().optional(),
  allowedNumbers: z.array(z.string()).default([]),
  allowedGroups: z.array(z.string()).default([]),
  allowDirectMessages: z.boolean().default(true),
  allowGroupMessages: z.boolean().default(false),
});

export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;
export type SignalConfig = z.infer<typeof SignalConfigSchema>;

/**
 * All channels configuration
 */
export const ChannelsConfigSchema = z.object({
  telegram: TelegramConfigSchema.default({}),
  discord: DiscordConfigSchema.default({}),
  signal: SignalConfigSchema.default({}),
});

export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;
