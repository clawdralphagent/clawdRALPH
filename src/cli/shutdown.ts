/**
 * Graceful shutdown handling
 */

import { createLogger } from '../logging/logger.js';

const log = createLogger('shutdown');

/**
 * Shutdown handler callback type
 */
export type ShutdownHandler = () => Promise<void> | void;

/**
 * Shutdown state
 */
interface ShutdownState {
  handlers: ShutdownHandler[];
  isShuttingDown: boolean;
  exitCode: number;
}

const state: ShutdownState = {
  handlers: [],
  isShuttingDown: false,
  exitCode: 0,
};

/**
 * Execute shutdown handlers
 */
async function executeShutdown(signal: string): Promise<void> {
  if (state.isShuttingDown) {
    log.debug('Shutdown already in progress');
    return;
  }

  state.isShuttingDown = true;
  log.info(`Received ${signal}, shutting down...`);

  // Execute handlers in reverse order (LIFO)
  const handlers = [...state.handlers].reverse();

  for (const handler of handlers) {
    try {
      await handler();
    } catch (error) {
      log.error('Error in shutdown handler', error);
    }
  }

  log.info('Shutdown complete');
  process.exit(state.exitCode);
}

/**
 * Setup process signal handlers for graceful shutdown
 */
export function setupShutdownHandlers(handler?: ShutdownHandler): void {
  // Add custom handler if provided
  if (handler) {
    state.handlers.push(handler);
  }

  // Only setup signal handlers once
  if (state.handlers.length === 1 || !handler) {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      void executeShutdown('SIGINT');
    });

    // Handle SIGTERM (kill)
    process.on('SIGTERM', () => {
      void executeShutdown('SIGTERM');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log.fatal('Uncaught exception', error);
      state.exitCode = 1;
      void executeShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      log.fatal('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
      state.exitCode = 1;
      void executeShutdown('unhandledRejection');
    });
  }
}

/**
 * Register a shutdown handler
 */
export function onShutdown(handler: ShutdownHandler): () => void {
  state.handlers.push(handler);

  // Return unregister function
  return () => {
    const index = state.handlers.indexOf(handler);
    if (index > -1) {
      state.handlers.splice(index, 1);
    }
  };
}

/**
 * Check if shutdown is in progress
 */
export function isShuttingDown(): boolean {
  return state.isShuttingDown;
}

/**
 * Trigger manual shutdown
 */
export async function shutdown(exitCode = 0): Promise<void> {
  state.exitCode = exitCode;
  await executeShutdown('manual');
}

/**
 * Set exit code for shutdown
 */
export function setExitCode(code: number): void {
  state.exitCode = code;
}
