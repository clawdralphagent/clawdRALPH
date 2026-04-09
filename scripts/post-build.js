#!/usr/bin/env node

/**
 * Post-build script for clawdRALPH
 * Handles asset copying and build finalization
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Copy default config template if it exists
const defaultConfigSrc = join(rootDir, 'config', 'default.json5');
const defaultConfigDest = join(distDir, 'config', 'default.json5');

if (existsSync(defaultConfigSrc)) {
  mkdirSync(dirname(defaultConfigDest), { recursive: true });
  copyFileSync(defaultConfigSrc, defaultConfigDest);
}

console.log('Post-build complete.');
