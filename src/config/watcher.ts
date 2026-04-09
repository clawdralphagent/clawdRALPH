/**
 * Configuration file watcher for hot-reload
 */

import { watch, type FSWatcher } from 'fs';
import { reloadConfig, getConfigMetadata } from './loader.js';
import { createLogger } from '../logging/logger.js';
import { debounce } from '../utils/async.js';
import type { AppConfig } from '../types/config.js';

const log = createLogger('config-watcher');

/**
 * Callback type for config change events
 */
export type ConfigChangeCallback = (config: AppConfig) => void;

/**
 * Configuration watcher state
 */
interface WatcherState {
  watcher: FSWatcher | null;
  callbacks: Set<ConfigChangeCallback>;
  isWatching: boolean;
}

const state: WatcherState = {
  watcher: null,
  callbacks: new Set(),
  isWatching: false,
};

/**
 * Handle file change event
 */
const handleChange = debounce(() => {
  log.debug('Configuration file changed, reloading...');

  const result = reloadConfig();

  if (result.success) {
    log.info('Configuration reloaded successfully');

    // Notify all callbacks
    for (const callback of state.callbacks) {
      try {
        callback(result.data);
      } catch (error) {
        log.error('Error in config change callback', error);
      }
    }
  } else {
    log.error('Failed to reload configuration', result.error);
  }
}, 500);

/**
 * Start watching the configuration file
 */
export function startConfigWatcher(): boolean {
  if (state.isWatching) {
    return true;
  }

  const metadata = getConfigMetadata();
  if (!metadata || metadata.isDefault) {
    log.debug('No configuration file to watch');
    return false;
  }

  try {
    state.watcher = watch(metadata.path, (eventType) => {
      if (eventType === 'change') {
        handleChange();
      }
    });

    state.watcher.on('error', (error) => {
      log.error('Config watcher error', error);
      stopConfigWatcher();
    });

    state.isWatching = true;
    log.debug('Started watching configuration file', { path: metadata.path });

    return true;
  } catch (error) {
    log.error('Failed to start config watcher', error);
    return false;
  }
}

/**
 * Stop watching the configuration file
 */
export function stopConfigWatcher(): void {
  if (state.watcher) {
    state.watcher.close();
    state.watcher = null;
  }
  state.isWatching = false;
  log.debug('Stopped watching configuration file');
}

/**
 * Add a callback for configuration changes
 */
export function onConfigChange(callback: ConfigChangeCallback): () => void {
  state.callbacks.add(callback);

  // Return unsubscribe function
  return () => {
    state.callbacks.delete(callback);
  };
}

/**
 * Check if watcher is active
 */
export function isWatching(): boolean {
  return state.isWatching;
}

/**
 * Get number of registered callbacks
 */
export function getCallbackCount(): number {
  return state.callbacks.size;
}
