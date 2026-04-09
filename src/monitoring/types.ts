/**
 * Monitoring and metrics types
 */

import { z } from 'zod';

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Metric value
 */
export interface MetricValue {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

/**
 * Histogram bucket
 */
export interface HistogramBucket {
  le: number;
  count: number;
}

/**
 * Histogram value
 */
export interface HistogramValue {
  name: string;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  labels?: Record<string, string>;
  timestamp: number;
}

/**
 * Health check status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health check result schema
 */
export const HealthCheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  message: z.string().optional(),
  duration: z.number(), // ms
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

/**
 * System health schema
 */
export const SystemHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  checks: z.array(HealthCheckResultSchema),
  timestamp: z.string().datetime(),
});

export type SystemHealth = z.infer<typeof SystemHealthSchema>;

/**
 * Alert severity
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Alert schema
 */
export const AlertSchema = z.object({
  id: z.string().uuid(),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  title: z.string(),
  message: z.string(),
  source: z.string(),
  timestamp: z.string().datetime(),
  resolved: z.boolean().default(false),
  resolvedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Alert = z.infer<typeof AlertSchema>;

/**
 * Resource usage
 */
export interface ResourceUsage {
  cpu: {
    usage: number; // percentage
    system: number;
    user: number;
  };
  memory: {
    used: number; // bytes
    total: number;
    percentage: number;
  };
  eventLoop: {
    lag: number; // ms
  };
}
