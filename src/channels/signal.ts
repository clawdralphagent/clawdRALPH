/**
 * Signal channel implementation using signal-cli
 *
 * Requires signal-cli to be installed: https://github.com/AsamK/signal-cli
 * The account must be linked or registered before use.
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { createLogger } from '../logging/logger.js';
import type { SignalConfig } from '../types/config.js';
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

const log = createLogger('signal');

/**
 * Signal message envelope from signal-cli JSON-RPC
 */
interface SignalEnvelope {
  source?: string;
  sourceNumber?: string;
  sourceName?: string;
  sourceDevice?: number;
  timestamp?: number;
  dataMessage?: {
    timestamp?: number;
    message?: string;
    groupInfo?: {
      groupId: string;
      type?: string;
    };
    attachments?: Array<{
      contentType: string;
      filename?: string;
      size?: number;
      id?: string;
    }>;
    quote?: {
      id: number;
      author: string;
    };
  };
  syncMessage?: {
    sentMessage?: {
      destination?: string;
      destinationNumber?: string;
      timestamp?: number;
      message?: string;
      groupInfo?: {
        groupId: string;
      };
    };
  };
}

/**
 * Signal JSON-RPC response
 */
interface SignalJsonRpcMessage {
  jsonrpc: string;
  method?: string;
  params?: {
    envelope?: SignalEnvelope;
    account?: string;
  };
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
  id?: number;
}

/**
 * Signal channel implementation
 */
export class SignalChannel implements Channel {
  readonly type = 'signal' as const;

  private config: SignalConfig;
  private state: ChannelStatus['state'] = 'disconnected';
  private connectedAt?: Date;
  private lastActivity?: Date;
  private error?: string;
  private messageCallbacks: Set<MessageCallback> = new Set();
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private rpcId = 0;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();

  constructor(config: SignalConfig) {
    this.config = config;
  }

  /**
   * Get current channel status
   */
  getStatus(): ChannelStatus {
    return {
      type: 'signal',
      state: this.state,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      error: this.error,
      metadata: {
        phoneNumber: this.config.phoneNumber,
      },
    };
  }

  /**
   * Get channel capabilities
   */
  getCapabilities(): ChannelCapabilities {
    return {
      supportsMarkdown: false,
      supportsHtml: false,
      supportsThreads: false,
      supportsReactions: true,
      supportsEditing: false,
      supportsDeleting: true,
      supportsVoice: true,
      supportsVideo: true,
      maxMessageLength: 8000,
      maxAttachmentSize: 100 * 1024 * 1024, // 100MB
    };
  }

  /**
   * Connect to Signal via signal-cli daemon
   */
  async connect(): Promise<void> {
    if (!this.config.phoneNumber) {
      throw new Error('Signal phone number is required');
    }

    if (this.state === 'connected') {
      return;
    }

    this.state = 'connecting';
    this.error = undefined;

    try {
      // Check if signal-cli is available
      const signalCliPath = this.config.signalCliPath ?? 'signal-cli';

      // Start signal-cli in JSON-RPC mode
      const args = [
        '-u', this.config.phoneNumber,
        'jsonRpc',
      ];

      if (this.config.configPath) {
        args.unshift('--config', this.config.configPath);
      }

      this.process = spawn(signalCliPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up readline for JSON-RPC messages
      if (this.process.stdout) {
        this.readline = createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity,
        });

        this.readline.on('line', (line) => {
          this.handleJsonRpcMessage(line);
        });
      }

      // Handle stderr for logging
      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          const message = data.toString().trim();
          if (message) {
            log.debug('signal-cli stderr', { message });
          }
        });
      }

      // Handle process errors
      this.process.on('error', (error) => {
        log.error('signal-cli process error', error);
        this.state = 'error';
        this.error = error.message;
      });

      this.process.on('exit', (code) => {
        log.info('signal-cli process exited', { code });
        if (this.state === 'connected') {
          this.state = 'disconnected';
        }
      });

      // Wait a moment for the process to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (this.process.exitCode !== null) {
        throw new Error(`signal-cli exited with code ${this.process.exitCode}`);
      }

      this.state = 'connected';
      this.connectedAt = new Date();
      log.info('Signal channel connected', { phoneNumber: this.config.phoneNumber });
    } catch (error) {
      this.state = 'error';
      this.error = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to connect Signal channel', error);
      throw error;
    }
  }

  /**
   * Disconnect from Signal
   */
  async disconnect(): Promise<void> {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.pendingRequests.clear();
    this.state = 'disconnected';
    this.connectedAt = undefined;
    log.info('Signal channel disconnected');
  }

  /**
   * Handle incoming JSON-RPC message
   */
  private handleJsonRpcMessage(line: string): void {
    try {
      const message = JSON.parse(line) as SignalJsonRpcMessage;

      // Handle response to our request
      if (message.id !== undefined && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      // Handle incoming message notification
      if (message.method === 'receive' && message.params?.envelope) {
        void this.handleEnvelope(message.params.envelope);
      }
    } catch (error) {
      log.error('Failed to parse JSON-RPC message', error, { line });
    }
  }

  /**
   * Handle Signal envelope (incoming message)
   */
  private async handleEnvelope(envelope: SignalEnvelope): Promise<void> {
    const dataMessage = envelope.dataMessage;
    if (!dataMessage || !dataMessage.message) return;

    const source = envelope.sourceNumber ?? envelope.source ?? '';
    const isGroup = !!dataMessage.groupInfo;
    const chatId = isGroup ? dataMessage.groupInfo!.groupId : source;

    // Check if message type is allowed
    if (isGroup && !this.config.allowGroupMessages) {
      return;
    }

    if (!isGroup && !this.config.allowDirectMessages) {
      return;
    }

    // Check allowlist/blocklist
    if (!this.isAllowed(chatId, source)) {
      return;
    }

    this.lastActivity = new Date();

    // Convert to normalized message
    const normalizedMessage = this.normalizeMessage(envelope, chatId, isGroup);

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
   * Normalize Signal message to common format
   */
  private normalizeMessage(envelope: SignalEnvelope, chatId: string, isGroup: boolean): ChannelMessage {
    const dataMessage = envelope.dataMessage!;
    const attachments: Attachment[] = [];

    // Handle attachments
    if (dataMessage.attachments) {
      for (const attachment of dataMessage.attachments) {
        let type: Attachment['type'] = 'other';
        if (attachment.contentType.startsWith('image/')) type = 'image';
        else if (attachment.contentType.startsWith('video/')) type = 'video';
        else if (attachment.contentType.startsWith('audio/')) type = 'audio';
        else type = 'document';

        attachments.push({
          id: attachment.id ?? '',
          type,
          filename: attachment.filename,
          mimeType: attachment.contentType,
          size: attachment.size,
        });
      }
    }

    const messageId = `${envelope.timestamp ?? Date.now()}`;
    const source = envelope.sourceNumber ?? envelope.source ?? '';

    return {
      id: messageId,
      channelType: 'signal',
      channelId: 'signal',
      chatId,
      chatType: isGroup ? 'group' : 'direct',
      senderId: source,
      senderName: envelope.sourceName ?? source,
      content: dataMessage.message ?? '',
      timestamp: new Date(dataMessage.timestamp ?? Date.now()),
      replyToId: dataMessage.quote ? String(dataMessage.quote.id) : undefined,
      attachments,
      metadata: {
        sourceDevice: envelope.sourceDevice,
        groupId: dataMessage.groupInfo?.groupId,
      },
      raw: envelope,
    };
  }

  /**
   * Send a JSON-RPC request
   */
  private sendRpcRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Not connected'));
        return;
      }

      const id = ++this.rpcId;
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id,
      };

      this.pendingRequests.set(id, { resolve, reject });

      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Send a message
   */
  async send(message: OutgoingMessage): Promise<SendResult> {
    if (this.state !== 'connected') {
      return { success: false, error: 'Not connected' };
    }

    try {
      // Determine if this is a group or direct message
      const isGroup = message.chatId.includes('='); // Group IDs are base64

      const params: Record<string, unknown> = {
        message: message.content,
        account: this.config.phoneNumber,
      };

      if (isGroup) {
        params.groupId = message.chatId;
      } else {
        params.recipient = [message.chatId];
      }

      if (message.replyToId) {
        params.quoteTimestamp = parseInt(message.replyToId, 10);
        params.quoteAuthor = message.chatId;
      }

      await this.sendRpcRequest('send', params);

      this.lastActivity = new Date();

      return {
        success: true,
        messageId: String(Date.now()),
      };
    } catch (error) {
      log.error('Failed to send Signal message', error);
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
  updateConfig(config: Partial<SignalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if signal-cli is available
   */
  static async isAvailable(signalCliPath?: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(signalCliPath ?? 'signal-cli', ['--version'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      proc.on('error', () => resolve(false));
      proc.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Link Signal account (generates QR code)
   */
  static async link(_phoneNumber: string, deviceName: string, signalCliPath?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['link', '-n', deviceName];
      const proc = spawn(signalCliPath ?? 'signal-cli', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        // The QR code link is output to stderr
        const match = errorOutput.match(/sgnl:\/\/[^\s]+/);
        if (match) {
          resolve(match[0]);
        }
      });

      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code !== 0 && !output.includes('sgnl://')) {
          reject(new Error(`signal-cli link failed with code ${code}`));
        }
      });

      // Timeout after 2 minutes
      setTimeout(() => reject(new Error('Link timeout')), 120000);
    });
  }
}

/**
 * Create a Signal channel instance
 */
export function createSignalChannel(config: SignalConfig): SignalChannel {
  return new SignalChannel(config);
}
