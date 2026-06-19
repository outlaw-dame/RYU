/**
 * Phase 37 -- Startup profiler.
 *
 * Measures time-to-interactive, critical path timing, and lazy-load
 * timing. Uses the Navigation Timing API and Performance Observer
 * when available, falling back gracefully in environments without
 * these APIs (Mobile Safari partial support, SSR, test runners).
 */

import type { StartupProfile, PerformanceMetric } from './types';

const metrics: PerformanceMetric[] = [];
let criticalPathStart: number | undefined;
let criticalPathEnd: number | undefined;
let lazyLoadStart: number | undefined;
let lazyLoadEnd: number | undefined;
let captured: StartupProfile | null = null;

/**
 * Mark the beginning of critical-path initialization.
 * Call this as early as possible in your app bootstrap.
 */
export function markCriticalPathStart(): void {
  criticalPathStart = performance.now();
}

/**
 * Mark the end of critical-path initialization.
 * Call this after essential modules are loaded and the first render completes.
 */
export function markCriticalPathEnd(): void {
  criticalPathEnd = performance.now();
}

/**
 * Mark the beginning of lazy/deferred module loading.
 */
export function markLazyLoadStart(): void {
  lazyLoadStart = performance.now();
}

/**
 * Mark the end of lazy/deferred module loading.
 */
export function markLazyLoadEnd(): void {
  lazyLoadEnd = performance.now();
}

/**
 * Record a named performance metric.
 */
export function recordMetric(metric: PerformanceMetric): void {
  metrics.push(metric);
}

/**
 * Retrieve all recorded metrics (for debug panels or telemetry).
 */
export function getRecordedMetrics(): readonly PerformanceMetric[] {
  return metrics;
}

/**
 * Clear all recorded metrics and reset profiling marks.
 */
export function resetStartupProfiler(): void {
  metrics.length = 0;
  criticalPathStart = undefined;
  criticalPathEnd = undefined;
  lazyLoadStart = undefined;
  lazyLoadEnd = undefined;
  captured = null;
}

function getNavigationTiming(): { domContentLoadedMs: number | undefined; ttiMs: number | undefined } {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return { domContentLoadedMs: undefined, ttiMs: undefined };
  }

  const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (entries.length === 0) {
    return { domContentLoadedMs: undefined, ttiMs: undefined };
  }

  const nav = entries[0];
  const domContentLoadedMs = nav.domContentLoadedEventEnd > 0
    ? nav.domContentLoadedEventEnd - nav.startTime
    : undefined;

  // Approximate TTI as loadEventEnd (full load) since the Long Tasks API
  // is not universally available. This is a conservative proxy.
  const ttiMs = nav.loadEventEnd > 0
    ? nav.loadEventEnd - nav.startTime
    : undefined;

  return { domContentLoadedMs, ttiMs };
}

/**
 * Capture the startup profile. Safe to call multiple times; returns
 * the cached result after the first capture.
 */
export function captureStartupProfile(): StartupProfile {
  if (captured) return captured;

  const { domContentLoadedMs, ttiMs } = getNavigationTiming();
  const criticalPathMs =
    typeof criticalPathStart === 'number' && typeof criticalPathEnd === 'number'
      ? criticalPathEnd - criticalPathStart
      : undefined;
  const lazyLoadMs =
    typeof lazyLoadStart === 'number' && typeof lazyLoadEnd === 'number'
      ? lazyLoadEnd - lazyLoadStart
      : undefined;

  captured = {
    domContentLoadedMs,
    timeToInteractiveMs: ttiMs,
    criticalPathMs,
    lazyLoadMs,
    capturedAt: new Date().toISOString()
  };

  if (criticalPathMs !== undefined) {
    recordMetric({
      name: 'critical-path',
      durationMs: criticalPathMs,
      timestamp: captured.capturedAt
    });
  }
  if (lazyLoadMs !== undefined) {
    recordMetric({
      name: 'lazy-load',
      durationMs: lazyLoadMs,
      timestamp: captured.capturedAt
    });
  }

  return captured;
}

/**
 * Get the cached startup profile, or null if not yet captured.
 */
export function getStartupProfile(): StartupProfile | null {
  return captured;
}
