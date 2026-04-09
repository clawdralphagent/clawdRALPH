/**
 * Channels module - messaging platform integrations
 */

// Types
export * from './types.js';

// Channel implementations
export { TelegramChannel, createTelegramChannel } from './telegram.js';
export { DiscordChannel, createDiscordChannel } from './discord.js';
export { SignalChannel, createSignalChannel } from './signal.js';

// Channel manager
export {
  ChannelManager,
  getChannelManager,
  initChannelManager,
  type ChannelManagerOptions,
} from './manager.js';
