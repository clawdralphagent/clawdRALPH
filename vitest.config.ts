import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'clawdbot/**',
        'ralph/**',
        'scripts/**',
        'src/**/*.test.ts',
        'src/types/**',
        'src/**/index.ts', // Re-export files
        'src/cli/commands/**', // CLI command stubs (Phase 1)
        'src/cli/shutdown.ts', // Shutdown handlers
        'src/entry.ts', // Entry point
        'src/test/**', // Test utilities
        'src/config/watcher.ts', // Config watcher (Phase 1)
      ],
      thresholds: {
        // Phase 1: Core modules only, CLI commands are stubs
        // Will increase thresholds as more implementation is added
        lines: 50,
        branches: 50,
        functions: 50,
        statements: 50,
      },
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/config': resolve(__dirname, 'src/config'),
      '@/cli': resolve(__dirname, 'src/cli'),
      '@/utils': resolve(__dirname, 'src/utils'),
      '@/logging': resolve(__dirname, 'src/logging'),
      '@/types': resolve(__dirname, 'src/types'),
    },
  },
});
