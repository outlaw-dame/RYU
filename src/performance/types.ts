/**
 * Phase 37 -- Performance and storage optimization types.
 *
 * Shared type definitions used across the performance monitoring,
 * storage optimization, and render budgeting modules.
 */

/** Memory pressure levels used by the memory monitor to signal degradation. */
export type MemoryPressureLevel = 'none' | 'moderate' | 'critical';

/** A single performance metric sample. */
export interface PerformanceMetric {
  /** Metric identifier (e.g. 'tti', 'fcp', 'search-render'). */
  name: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** ISO timestamp when the metric was recorded. */
  timestamp: string;
  /** Optional metadata for diagnostics. */
  metadata?: Record<string, string | number | boolean>;
}

/** Configurable budget thresholds for performance gates. */
export interface PerformanceBudget {
  /** Maximum time-to-interactive in ms (default 3000). */
  maxTtiMs: number;
  /** Maximum main-thread work per frame in ms (default 50). */
  maxFrameBudgetMs: number;
  /** Maximum JS heap usage ratio before triggering moderate pressure. */
  heapPressureModerateRatio: number;
  /** Maximum JS heap usage ratio before triggering critical pressure. */
  heapPressureCriticalRatio: number;
  /** Maximum storage usage ratio before triggering optimization. */
  storageWarningRatio: number;
  /** Maximum number of cached images to retain in memory. */
  maxImageCacheSize: number;
}

/** Report from the storage optimizer describing current state. */
export interface StorageReport {
  /** Total bytes used by the origin. */
  usageBytes: number | undefined;
  /** Total quota available to the origin. */
  quotaBytes: number | undefined;
  /** Usage ratio (0-1). Undefined when quota is unknown. */
  usageRatio: number | undefined;
  /** Number of stale entries identified for eviction. */
  staleEntries: number;
  /** Bytes freed during the last optimization pass. */
  bytesFreed: number;
  /** ISO timestamp of the last optimization run. */
  lastOptimizedAt: string | undefined;
}

/** Startup profiling result. */
export interface StartupProfile {
  /** Time from navigation start to DOMContentLoaded. */
  domContentLoadedMs: number | undefined;
  /** Time from navigation start to interactive (first input or load). */
  timeToInteractiveMs: number | undefined;
  /** Time to initialize critical-path modules. */
  criticalPathMs: number | undefined;
  /** Time taken by deferred/lazy-loaded modules after initial render. */
  lazyLoadMs: number | undefined;
  /** ISO timestamp when profiling was captured. */
  capturedAt: string;
}

/** State exposed by the usePerformanceMonitor hook. */
export interface PerformanceMonitorState {
  memoryPressure: MemoryPressureLevel;
  storageReport: StorageReport | null;
  renderBudgetExceeded: boolean;
  startupProfile: StartupProfile | null;
}

/** Default performance budget values. */
export const DEFAULT_PERFORMANCE_BUDGET: PerformanceBudget = {
  maxTtiMs: 3000,
  maxFrameBudgetMs: 50,
  heapPressureModerateRatio: 0.7,
  heapPressureCriticalRatio: 0.9,
  storageWarningRatio: 0.8,
  maxImageCacheSize: 50
};
