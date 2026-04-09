#!/usr/bin/env node

/**
 * clawdRALPH CLI Entry Point
 *
 * The Autonomous Multi-Channel AI Development Agent
 */

import { runProgram } from './cli/program.js';

// Run the CLI
runProgram().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
