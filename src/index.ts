/**
 * clawdRALPH - The Autonomous Multi-Channel AI Development Agent
 *
 * Main module exports for programmatic usage
 */

// Types
export * from './types/index.js';

// Configuration
export * from './config/index.js';

// Logging
export * from './logging/index.js';

// Utilities
export * from './utils/index.js';

// CLI (for building custom CLIs)
export { buildProgram, runProgram } from './cli/program.js';
