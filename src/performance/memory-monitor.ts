/**
 * Phase 37 -- Memory monitor.
 *
 * Monitors JS heap usage via the non-standard performance.memory API
 * (Chrome/Edge) and triggers degradation at configurable thresholds.
 * Falls back gracefully on browsers without memory introspection
 * (Safari, Firefox).
 *
 * Provides a subscribe/getSnapshot pattern compatible with
 * useSyncExternalStore for React integration.
 */

import type { MemoryPressureLevel, PerformanceBudget } from './types';
import { DEFAULT_PERFORMANCE_BUDGET } from './types';

type PerformanceMemory = {
  jsHeapSizeLimit?: number;
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
};

type PerformanceWithMemory = Performance & { memory?: PerformanceMemory };

export interface MemorySnapshot {
  level: MemoryPressureLevel;
  usedBytes: number | undefined;
  limitBytes: number | undefined;
  usageRatio: number | undefined;
  timestamp: string;
}

let currentSnapshot: MemorySnapshot = createSnapshot();
let pollingInterval: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
let budget: PerformanceBudget = DEFAULT_PERFORMANCE_BUDGET;

function getMemoryApi(): PerformanceMemory | undefined {
  if (typeof performance === 'undefined') return undefined;
  return (performance as PerformanceWithMemory).memory;
}

function computeLevel(usageRatio: number | undefined): MemoryPressureLevel {
  if (typeof usageRatio !== 'number') return 'none';
  if (usageRatio >= budget.heapPressureCriticalRatio) return 'critical';
  if (usageRatio >= budget.heapPressureModerateRatio) return 'moderate';
  return 'none';
}

function createSnapshot(): MemorySnapshot {
  const memory = getMemoryApi();
  const usedBytes = memory?.usedJSHeapSize;
  const limitBytes = memory?.jsHeapSizeLimit;
  const usageRatio =
    typeof usedBytes === 'number' && typeof limitBytes === 'number' && limitBytes > 0
      ? usedBytes / limitBytes
      : undefined;

  return {
    level: computeLevel(usageRatio),
    usedBytes,
    limitBytes,
    usageRatio,
    timestamp: new Date().toISOString()
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function poll(): void {
  const next = createSnapshot();
  if (next.level !== currentSnapshot.level || next.usageRatio !== currentSnapshot.usageRatio) {
    currentSnapshot = next;
    notify();
  }
}

/**
 * Start the memory monitor polling loop.
 * @param intervalMs How often to sample (default 5000ms).
 * @param customBudget Optional budget overrides.
 */
export function startMemoryMonitor(intervalMs = 5000, customBudget?: Partial<PerformanceBudget>): void {
  if (customBudget) {
    budget = { ...DEFAULT_PERFORMANCE_BUDGET, ...customBudget };
  }
  if (pollingInterval !== null) return;
  currentSnapshot = createSnapshot();
  pollingInterval = setInterval(poll, intervalMs);
}

/**
 * Stop the memory monitor polling loop.
 */
export function stopMemoryMonitor(): void {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Get the current memory pressure level (useSyncExternalStore-compatible).
 */
export function getMemoryPressureLevel(): MemoryPressureLevel {
  return currentSnapshot.level;
}

/**
 * Get the full memory snapshot.
 */
export function getMemorySnapshot(): MemorySnapshot {
  return currentSnapshot;
}

/**
 * Subscribe to memory pressure changes (useSyncExternalStore-compatible).
 */
export function subscribeMemoryMonitor(callback: () => void): () => void {
  listeners.add(callback);
  if (listeners.size === 1) {
    startMemoryMonitor();
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      stopMemoryMonitor();
    }
  };
}

/**
 * Force a re-sample. Useful after known memory-intensive operations.
 */
export function sampleMemoryNow(): MemorySnapshot {
  const next = createSnapshot();
  if (next.level !== currentSnapshot.level || next.usageRatio !== currentSnapshot.usageRatio) {
    currentSnapshot = next;
    notify();
  }
  return currentSnapshot;
}

/**
 * Reset monitor state. Intended for tests.
 */
export function resetMemoryMonitor(): void {
  stopMemoryMonitor();
  listeners.clear();
  budget = DEFAULT_PERFORMANCE_BUDGET;
  currentSnapshot = createSnapshot();
}
