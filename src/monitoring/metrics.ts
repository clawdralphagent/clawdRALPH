/**
 * Metrics collection and reporting
 */

import type { MetricValue, HistogramValue, ResourceUsage } from './types.js';

/**
 * Default histogram buckets (in ms for latency)
 */
const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Counter metric
 */
class Counter {
  private values: Map<string, number> = new Map();

  constructor(_name: string) {}

  inc(labels?: Record<string, string>, value: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + value);
  }

  get(labels?: Record<string, string>): number {
    const key = this.labelsToKey(labels);
    return this.values.get(key) ?? 0;
  }

  getAll(): Array<{ labels?: Record<string, string>; value: number }> {
    return Array.from(this.values.entries()).map(([key, value]) => ({
      labels: this.keyToLabels(key),
      value,
    }));
  }

  reset(): void {
    this.values.clear();
  }

  private labelsToKey(labels?: Record<string, string>): string {
    if (!labels) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private keyToLabels(key: string): Record<string, string> | undefined {
    if (!key) return undefined;
    const labels: Record<string, string> = {};
    for (const pair of key.split(',')) {
      const parts = pair.split('=');
      const k = parts[0];
      const v = parts[1];
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    }
    return labels;
  }
}

/**
 * Gauge metric
 */
class Gauge {
  private values: Map<string, number> = new Map();

  constructor(_name: string) {}

  set(value: number, labels?: Record<string, string>): void {
    const key = this.labelsToKey(labels);
    this.values.set(key, value);
  }

  inc(labels?: Record<string, string>, value: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + value);
  }

  dec(labels?: Record<string, string>, value: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current - value);
  }

  get(labels?: Record<string, string>): number {
    const key = this.labelsToKey(labels);
    return this.values.get(key) ?? 0;
  }

  getAll(): Array<{ labels?: Record<string, string>; value: number }> {
    return Array.from(this.values.entries()).map(([key, value]) => ({
      labels: this.keyToLabels(key),
      value,
    }));
  }

  private labelsToKey(labels?: Record<string, string>): string {
    if (!labels) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private keyToLabels(key: string): Record<string, string> | undefined {
    if (!key) return undefined;
    const labels: Record<string, string> = {};
    for (const pair of key.split(',')) {
      const parts = pair.split('=');
      const k = parts[0];
      const v = parts[1];
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    }
    return labels;
  }
}

/**
 * Histogram metric
 */
class Histogram {
  private buckets: number[];
  private values: Map<string, { counts: number[]; sum: number; count: number }> = new Map();

  constructor(
    _name: string,
    buckets: number[] = DEFAULT_BUCKETS
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(value: number, labels?: Record<string, string>): void {
    const key = this.labelsToKey(labels);
    let data = this.values.get(key);

    if (!data) {
      data = {
        counts: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.values.set(key, data);
    }

    data.sum += value;
    data.count++;

    for (let i = 0; i < this.buckets.length; i++) {
      const bucket = this.buckets[i];
      const currentCount = data.counts[i];
      if (bucket !== undefined && currentCount !== undefined && value <= bucket) {
        data.counts[i] = currentCount + 1;
      }
    }
  }

  getAll(): Array<{
    labels?: Record<string, string>;
    buckets: Array<{ le: number; count: number }>;
    sum: number;
    count: number;
  }> {
    return Array.from(this.values.entries()).map(([key, data]) => ({
      labels: this.keyToLabels(key),
      buckets: this.buckets.map((le, i) => ({
        le,
        count: data.counts.slice(0, i + 1).reduce((a, b) => a + b, 0),
      })),
      sum: data.sum,
      count: data.count,
    }));
  }

  private labelsToKey(labels?: Record<string, string>): string {
    if (!labels) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private keyToLabels(key: string): Record<string, string> | undefined {
    if (!key) return undefined;
    const labels: Record<string, string> = {};
    for (const pair of key.split(',')) {
      const parts = pair.split('=');
      const k = parts[0];
      const v = parts[1];
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    }
    return labels;
  }
}

/**
 * Metrics registry
 */
export class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private startTime = Date.now();

  /**
   * Create or get a counter
   */
  counter(name: string): Counter {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = new Counter(name);
      this.counters.set(name, counter);
    }
    return counter;
  }

  /**
   * Create or get a gauge
   */
  gauge(name: string): Gauge {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = new Gauge(name);
      this.gauges.set(name, gauge);
    }
    return gauge;
  }

  /**
   * Create or get a histogram
   */
  histogram(name: string, buckets?: number[]): Histogram {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = new Histogram(name, buckets);
      this.histograms.set(name, histogram);
    }
    return histogram;
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get resource usage
   */
  getResourceUsage(): ResourceUsage {
    const memUsage = process.memoryUsage();

    return {
      cpu: {
        usage: 0, // Would need proper CPU monitoring
        system: 0,
        user: 0,
      },
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      eventLoop: {
        lag: 0, // Would need proper event loop monitoring
      },
    };
  }

  /**
   * Get all metrics as values
   */
  getAll(): {
    counters: Array<MetricValue>;
    gauges: Array<MetricValue>;
    histograms: Array<HistogramValue>;
  } {
    const now = Date.now();

    const counters: MetricValue[] = [];
    for (const [name, counter] of this.counters) {
      for (const { labels, value } of counter.getAll()) {
        counters.push({ name, type: 'counter', value, labels, timestamp: now });
      }
    }

    const gauges: MetricValue[] = [];
    for (const [name, gauge] of this.gauges) {
      for (const { labels, value } of gauge.getAll()) {
        gauges.push({ name, type: 'gauge', value, labels, timestamp: now });
      }
    }

    const histograms: HistogramValue[] = [];
    for (const [name, histogram] of this.histograms) {
      for (const { labels, buckets, sum, count } of histogram.getAll()) {
        histograms.push({ name, buckets, sum, count, labels, timestamp: now });
      }
    }

    return { counters, gauges, histograms };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset();
    }
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

// Global metrics registry
let globalRegistry: MetricsRegistry | null = null;

/**
 * Get the global metrics registry
 */
export function getMetrics(): MetricsRegistry {
  if (!globalRegistry) {
    globalRegistry = new MetricsRegistry();
  }
  return globalRegistry;
}

// Pre-defined metrics
export const metrics = {
  // Gateway metrics
  gatewayConnections: () => getMetrics().gauge('gateway_connections_total'),
  gatewayMessagesReceived: () => getMetrics().counter('gateway_messages_received_total'),
  gatewayMessagesSent: () => getMetrics().counter('gateway_messages_sent_total'),
  gatewayMessageErrors: () => getMetrics().counter('gateway_message_errors_total'),
  gatewayRequestDuration: () => getMetrics().histogram('gateway_request_duration_ms'),

  // Session metrics
  sessionsActive: () => getMetrics().gauge('sessions_active'),
  sessionsTotal: () => getMetrics().counter('sessions_created_total'),

  // Loop metrics
  loopIterations: () => getMetrics().counter('loop_iterations_total'),
  loopStoriesCompleted: () => getMetrics().counter('loop_stories_completed_total'),
  loopStoriesFailed: () => getMetrics().counter('loop_stories_failed_total'),
  loopIterationDuration: () => getMetrics().histogram('loop_iteration_duration_ms'),

  // AI metrics
  aiRequests: () => getMetrics().counter('ai_requests_total'),
  aiErrors: () => getMetrics().counter('ai_errors_total'),
  aiRequestDuration: () => getMetrics().histogram('ai_request_duration_ms'),
  aiTokensUsed: () => getMetrics().counter('ai_tokens_used_total'),

  // Channel metrics
  channelMessages: () => getMetrics().counter('channel_messages_total'),
  channelErrors: () => getMetrics().counter('channel_errors_total'),
};
