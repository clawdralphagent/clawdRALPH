/**
 * Tests for dev server integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DevServerManager, createDevServerManager } from './devserver.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...(actual as object),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

describe('DevServerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectServerType', () => {
    it('should detect vite project', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('vite.config.ts');
      });

      const manager = new DevServerManager('/test/project');
      const type = await manager.detectServerType();
      expect(type).toBe('vite');
    });

    it('should detect next project', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('next.config.js');
      });

      const manager = new DevServerManager('/test/project');
      const type = await manager.detectServerType();
      expect(type).toBe('next');
    });

    it('should detect remix project', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('remix.config.js');
      });

      const manager = new DevServerManager('/test/project');
      const type = await manager.detectServerType();
      expect(type).toBe('remix');
    });

    it('should detect astro project', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('astro.config.mjs');
      });

      const manager = new DevServerManager('/test/project');
      const type = await manager.detectServerType();
      expect(type).toBe('astro');
    });

    it('should detect from package.json dependencies', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          dependencies: { vite: '^5.0.0' },
        })
      );

      const manager = new DevServerManager('/test/project');
      const type = await manager.detectServerType();
      expect(type).toBe('vite');
    });

    it('should return unknown for unrecognized projects', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const manager = new DevServerManager('/test/project');
      const type = await manager.detectServerType();
      expect(type).toBe('unknown');
    });
  });

  describe('getStartCommand', () => {
    it('should use custom command if provided', async () => {
      const manager = new DevServerManager('/test/project', {
        command: 'custom-server start',
      });

      const { command, args } = await manager.getStartCommand();
      expect(command).toBe('custom-server');
      expect(args).toEqual(['start']);
    });

    it('should detect npm run dev for vite', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('vite.config.ts') || pathStr.includes('package.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          scripts: { dev: 'vite' },
        })
      );

      const manager = new DevServerManager('/test/project');
      const { command, args } = await manager.getStartCommand();
      expect(command).toBe('npm');
      expect(args).toContain('dev');
    });

    it('should use pnpm when pnpm-lock.yaml exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return (
          pathStr.includes('package.json') || pathStr.includes('pnpm-lock.yaml')
        );
      });

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          scripts: { dev: 'vite' },
        })
      );

      const manager = new DevServerManager('/test/project');
      const { command, args } = await manager.getStartCommand();
      expect(command).toBe('pnpm');
    });

    it('should use yarn when yarn.lock exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json') || pathStr.includes('yarn.lock');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          scripts: { dev: 'vite' },
        })
      );

      const manager = new DevServerManager('/test/project');
      const { command, args } = await manager.getStartCommand();
      expect(command).toBe('yarn');
    });
  });

  describe('isPortAvailable', () => {
    it('should check port availability', async () => {
      const manager = new DevServerManager('/test/project');

      // Use a high port that's likely available
      const available = await manager.isPortAvailable(59999);
      expect(typeof available).toBe('boolean');
    });
  });

  describe('getInfo', () => {
    it('should return null when not started', () => {
      const manager = new DevServerManager('/test/project');
      expect(manager.getInfo()).toBeNull();
    });
  });

  describe('isRunning', () => {
    it('should return false when not started', () => {
      const manager = new DevServerManager('/test/project');
      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('getOutput', () => {
    it('should return empty array when not started', () => {
      const manager = new DevServerManager('/test/project');
      expect(manager.getOutput()).toEqual([]);
    });
  });
});

describe('createDevServerManager', () => {
  it('should create a DevServerManager instance', () => {
    const manager = createDevServerManager('/test/project');
    expect(manager).toBeInstanceOf(DevServerManager);
  });

  it('should accept config options', () => {
    const manager = createDevServerManager('/test/project', {
      port: 8080,
      host: '0.0.0.0',
    });
    expect(manager).toBeInstanceOf(DevServerManager);
  });
});
