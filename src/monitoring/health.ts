/**
 * Health check system
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../logging/logger.js';
import { getMetrics } from './metrics.js';
import type {
  HealthStatus,
  HealthCheckResult,
  SystemHealth,
  Alert,
  AlertSeverity,
} from './types.js';

const log = createLogger('health');

/**
 * Health check function type
 */
type HealthCheckFn = () => Promise<HealthCheckResult>;

/**
 * Health check manager
 */
export class HealthCheckManager {
  private checks: Map<string, HealthCheckFn> = new Map();
  private alerts: Alert[] = [];
  private maxAlerts = 1000;
  private startTime = Date.now();
  private version: string;

  constructor(version: string = '0.0.0') {
    this.version = version;
  }

  /**
   * Register a health check
   */
  register(name: string, check: HealthCheckFn): void {
    this.checks.set(name, check);
    log.debug('Registered health check', { name });
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Run all health checks
   */
  async check(): Promise<SystemHealth> {
    const results: HealthCheckResult[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const [name, checkFn] of this.checks) {
      const start = Date.now();
      try {
        const result = await checkFn();
        results.push(result);

        // Update overall status
        if (result.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        const duration = Date.now() - start;
        results.push({
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
          timestamp: new Date().toISOString(),
        });
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run a single health check by name
   */
  async checkOne(name: string): Promise<HealthCheckResult | null> {
    const checkFn = this.checks.get(name);
    if (!checkFn) return null;

    try {
      return await checkFn();
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Add an alert
   */
  alert(
    severity: AlertSeverity,
    title: string,
    message: string,
    source: string,
    metadata?: Record<string, unknown>
  ): Alert {
    const alert: Alert = {
      id: uuidv4(),
      severity,
      title,
      message,
      source,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata,
    };

    this.alerts.unshift(alert);

    // Trim old alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    log.warn('Alert created', { severity, title, source });

    return alert;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(id: string): boolean {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter((a) => !a.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(limit = 100): Alert[] {
    return this.alerts.slice(0, limit);
  }

  /**
   * Clear resolved alerts
   */
  clearResolved(): void {
    this.alerts = this.alerts.filter((a) => !a.resolved);
  }
}

// Global health check manager
let globalManager: HealthCheckManager | null = null;

/**
 * Get the global health check manager
 */
export function getHealthManager(): HealthCheckManager {
  if (!globalManager) {
    globalManager = new HealthCheckManager();
  }
  return globalManager;
}

/**
 * Initialize health checks with version
 */
export function initHealthChecks(version: string): HealthCheckManager {
  globalManager = new HealthCheckManager(version);
  registerDefaultChecks();
  return globalManager;
}

/**
 * Register default health checks
 */
function registerDefaultChecks(): void {
  const manager = getHealthManager();

  // Memory check
  manager.register('memory', async () => {
    const start = Date.now();
    const memUsage = process.memoryUsage();
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let status: HealthStatus = 'healthy';
    let message = `Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`;

    if (heapPercentage > 90) {
      status = 'unhealthy';
      message = 'Memory usage critically high';
    } else if (heapPercentage > 75) {
      status = 'degraded';
      message = 'Memory usage elevated';
    }

    return {
      name: 'memory',
      status,
      message,
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      metadata: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
    };
  });

  // Event loop lag check
  manager.register('eventLoop', async () => {
    const start = Date.now();
    const checkStart = process.hrtime.bigint();

    // Wait a tick
    await new Promise((resolve) => setImmediate(resolve));

    const checkEnd = process.hrtime.bigint();
    const lagNs = Number(checkEnd - checkStart);
    const lagMs = lagNs / 1_000_000;

    let status: HealthStatus = 'healthy';
    let message = `Event loop lag: ${lagMs.toFixed(2)}ms`;

    if (lagMs > 100) {
      status = 'unhealthy';
      message = 'Event loop severely blocked';
    } else if (lagMs > 50) {
      status = 'degraded';
      message = 'Event loop lag elevated';
    }

    return {
      name: 'eventLoop',
      status,
      message,
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      metadata: { lagMs },
    };
  });

  // Metrics check
  manager.register('metrics', async () => {
    const start = Date.now();
    const metrics = getMetrics();
    const uptime = metrics.getUptime();

    return {
      name: 'metrics',
      status: 'healthy',
      message: `Metrics collection active, uptime: ${uptime}s`,
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      metadata: { uptime },
    };
  });
}

/**
 * Create a simple health check function
 */
export function createHealthCheck(
  name: string,
  check: () => Promise<{ ok: boolean; message?: string; metadata?: Record<string, unknown> }>
): HealthCheckFn {
  return async () => {
    const start = Date.now();
    try {
      const result = await check();
      return {
        name,
        status: result.ok ? 'healthy' : 'unhealthy',
        message: result.message,
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        metadata: result.metadata,
      };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }
  };
}
