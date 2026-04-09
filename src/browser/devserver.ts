/**
 * Dev server integration
 * Auto-detection and management of local development servers
 */

import { createLogger } from '../logging/logger.js';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import {
  DevServerConfigSchema,
  type DevServerInfo,
  type DevServerType,
  type DevServerConfig,
} from './types.js';

const log = createLogger('browser-devserver');

/**
 * Dev server detection patterns
 */
const DEV_SERVER_PATTERNS: Record<DevServerType, {
  files: string[];
  scripts: string[];
  defaultPort: number;
  readyPattern: RegExp;
}> = {
  vite: {
    files: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'],
    scripts: ['dev', 'serve'],
    defaultPort: 5173,
    readyPattern: /Local:\s+https?:\/\/localhost:(\d+)/,
  },
  webpack: {
    files: ['webpack.config.js', 'webpack.config.ts'],
    scripts: ['start', 'dev', 'serve'],
    defaultPort: 8080,
    readyPattern: /Compiled successfully|webpack.*compiled/i,
  },
  next: {
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    scripts: ['dev'],
    defaultPort: 3000,
    readyPattern: /ready.*started.*on|Local:\s+https?:\/\//,
  },
  remix: {
    files: ['remix.config.js', 'remix.config.ts'],
    scripts: ['dev'],
    defaultPort: 3000,
    readyPattern: /Remix.*server.*started|Local:\s+https?:\/\//,
  },
  astro: {
    files: ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'],
    scripts: ['dev'],
    defaultPort: 4321,
    readyPattern: /Local:\s+https?:\/\/localhost:(\d+)/,
  },
  'create-react-app': {
    files: [],
    scripts: ['start'],
    defaultPort: 3000,
    readyPattern: /Compiled successfully|You can now view/,
  },
  parcel: {
    files: ['.parcelrc'],
    scripts: ['start', 'dev'],
    defaultPort: 1234,
    readyPattern: /Server running at/,
  },
  esbuild: {
    files: ['esbuild.config.js', 'esbuild.config.mjs'],
    scripts: ['dev', 'serve'],
    defaultPort: 8000,
    readyPattern: /Local:\s+https?:\/\/localhost:(\d+)/,
  },
  custom: {
    files: [],
    scripts: [],
    defaultPort: 3000,
    readyPattern: /listening|started|ready/i,
  },
  unknown: {
    files: [],
    scripts: ['dev', 'start', 'serve'],
    defaultPort: 3000,
    readyPattern: /listening|started|ready/i,
  },
};

/**
 * Dev server manager
 */
export class DevServerManager {
  private config: DevServerConfig;
  private process: ChildProcess | null = null;
  private info: DevServerInfo | null = null;
  private output: string[] = [];
  private cwd: string;

  constructor(cwd: string, config: Partial<DevServerConfig> = {}) {
    this.config = DevServerConfigSchema.parse(config);
    this.cwd = cwd;
  }

  /**
   * Detect the type of dev server in the project
   */
  async detectServerType(): Promise<DevServerType> {
    log.debug('Detecting dev server type', { cwd: this.cwd });

    // Check for config files
    for (const [type, pattern] of Object.entries(DEV_SERVER_PATTERNS)) {
      if (type === 'unknown' || type === 'custom') continue;

      for (const file of pattern.files) {
        const filePath = path.join(this.cwd, file);
        if (fs.existsSync(filePath)) {
          log.info('Detected dev server type', { type, file });
          return type as DevServerType;
        }
      }
    }

    // Check package.json for clues
    const pkgPath = path.join(this.cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        if (deps.vite) return 'vite';
        if (deps.next) return 'next';
        if (deps['@remix-run/dev']) return 'remix';
        if (deps.astro) return 'astro';
        if (deps['react-scripts']) return 'create-react-app';
        if (deps.parcel) return 'parcel';
        if (deps['webpack-dev-server']) return 'webpack';
      } catch {
        // Ignore parse errors
      }
    }

    return 'unknown';
  }

  /**
   * Get the command to start the dev server
   */
  async getStartCommand(): Promise<{ command: string; args: string[] }> {
    if (this.config.command) {
      const parts = this.config.command.split(' ');
      return { command: parts[0] || 'npm', args: parts.slice(1) };
    }

    const type = await this.detectServerType();
    const pattern = DEV_SERVER_PATTERNS[type];

    // Read package.json to find scripts
    const pkgPath = path.join(this.cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        for (const scriptName of pattern.scripts) {
          if (scripts[scriptName]) {
            // Check for package manager
            const hasYarn = fs.existsSync(path.join(this.cwd, 'yarn.lock'));
            const hasPnpm = fs.existsSync(path.join(this.cwd, 'pnpm-lock.yaml'));
            const hasBun = fs.existsSync(path.join(this.cwd, 'bun.lockb'));

            let pm = 'npm';
            if (hasBun) pm = 'bun';
            else if (hasPnpm) pm = 'pnpm';
            else if (hasYarn) pm = 'yarn';

            return {
              command: pm,
              args: pm === 'npm' ? ['run', scriptName] : [scriptName],
            };
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Fallback
    return { command: 'npm', args: ['run', 'dev'] };
  }

  /**
   * Check if a port is available
   */
  async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Find an available port
   */
  async findAvailablePort(startPort: number = 3000): Promise<number> {
    let port = startPort;
    while (port < 65535) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
      port++;
    }
    throw new Error('No available ports found');
  }

  /**
   * Start the dev server
   */
  async start(): Promise<DevServerInfo> {
    if (this.process) {
      log.warn('Dev server already running');
      return this.info!;
    }

    const type = await this.detectServerType();
    const { command, args } = await this.getStartCommand();
    const port = this.config.port || DEV_SERVER_PATTERNS[type].defaultPort;
    const host = this.config.host || 'localhost';

    log.info('Starting dev server', { type, command, args, port });

    // Check port availability
    if (!(await this.isPortAvailable(port))) {
      const newPort = await this.findAvailablePort(port + 1);
      log.warn('Port in use, using alternative', { originalPort: port, newPort });
    }

    this.info = {
      type,
      port,
      host,
      url: `http://${host}:${port}`,
      status: 'starting',
      command: `${command} ${args.join(' ')}`,
    };

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PORT: String(port),
        HOST: host,
      };

      this.process = spawn(command, args, {
        cwd: this.config.cwd || this.cwd,
        env,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.info!.pid = this.process.pid;

      const pattern = DEV_SERVER_PATTERNS[type].readyPattern;
      const customPattern = this.config.readyPattern
        ? new RegExp(this.config.readyPattern)
        : null;
      const readyPattern = customPattern || pattern;

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Assume it's ready if no ready pattern matched but server is running
          if (this.process && !this.process.killed) {
            this.info!.status = 'running';
            log.warn('Dev server timeout waiting for ready signal, assuming running');
            resolve(this.info!);
          } else {
            reject(new Error('Dev server failed to start within timeout'));
          }
        }
      }, this.config.readyTimeout || 60000);

      const checkReady = (data: string) => {
        this.output.push(data);

        // Keep only last 100 lines
        if (this.output.length > 100) {
          this.output = this.output.slice(-100);
        }

        if (!resolved && readyPattern.test(data)) {
          resolved = true;
          clearTimeout(timeout);
          this.info!.status = 'running';

          // Try to extract actual port from output
          const portMatch = data.match(/localhost:(\d+)/);
          if (portMatch && portMatch[1]) {
            this.info!.port = parseInt(portMatch[1], 10);
            this.info!.url = `http://${host}:${this.info!.port}`;
          }

          log.info('Dev server ready', { url: this.info!.url });
          resolve(this.info!);
        }
      };

      this.process.stdout?.on('data', (data) => {
        const str = data.toString();
        log.debug('Dev server stdout', { data: str.trim() });
        checkReady(str);
      });

      this.process.stderr?.on('data', (data) => {
        const str = data.toString();
        log.debug('Dev server stderr', { data: str.trim() });
        checkReady(str);
      });

      this.process.on('error', (error) => {
        clearTimeout(timeout);
        this.info!.status = 'error';
        log.error('Dev server error', { error });
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      this.process.on('exit', (code) => {
        clearTimeout(timeout);
        this.info!.status = 'stopped';
        this.process = null;
        log.info('Dev server exited', { code });
        if (!resolved) {
          resolved = true;
          reject(new Error(`Dev server exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Stop the dev server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      log.debug('No dev server to stop');
      return;
    }

    log.info('Stopping dev server', { pid: this.process.pid });

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.process.on('exit', () => {
        this.process = null;
        if (this.info) {
          this.info.status = 'stopped';
        }
        resolve();
      });

      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.process) {
          log.warn('Force killing dev server');
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Restart the dev server
   */
  async restart(): Promise<DevServerInfo> {
    await this.stop();
    return this.start();
  }

  /**
   * Get current server info
   */
  getInfo(): DevServerInfo | null {
    return this.info;
  }

  /**
   * Get server output logs
   */
  getOutput(): string[] {
    return [...this.output];
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Wait for server to be accessible
   */
  async waitForReady(timeout: number = 30000): Promise<boolean> {
    if (!this.info) {
      return false;
    }

    const startTime = Date.now();
    const url = this.info.url;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(1000),
        });

        if (response.ok || response.status < 500) {
          return true;
        }
      } catch {
        // Server not ready yet
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    return false;
  }
}

/**
 * Detect running dev server on common ports
 */
export async function detectRunningDevServer(
  ports: number[] = [3000, 5173, 8080, 4321, 1234]
): Promise<DevServerInfo | null> {
  for (const port of ports) {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(1000),
      });

      if (response.ok || response.status < 500) {
        log.info('Found running dev server', { port });

        return {
          type: 'unknown',
          port,
          host: 'localhost',
          url: `http://localhost:${port}`,
          status: 'running',
        };
      }
    } catch {
      // Port not serving
    }
  }

  return null;
}

/**
 * Get or start a dev server
 */
export async function ensureDevServer(
  cwd: string,
  config: Partial<DevServerConfig> = {}
): Promise<{ server: DevServerManager; info: DevServerInfo }> {
  // First check if server is already running
  const existing = await detectRunningDevServer();
  if (existing) {
    log.info('Using existing dev server', { url: existing.url });
    const server = new DevServerManager(cwd, { ...config, port: existing.port });
    return { server, info: existing };
  }

  // Start new server
  const server = new DevServerManager(cwd, config);
  const info = await server.start();
  return { server, info };
}

/**
 * Create a dev server manager
 */
export function createDevServerManager(
  cwd: string,
  config: Partial<DevServerConfig> = {}
): DevServerManager {
  return new DevServerManager(cwd, config);
}
