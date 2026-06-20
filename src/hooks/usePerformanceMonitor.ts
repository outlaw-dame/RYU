/**
 * Phase 37 -- usePerformanceMonitor hook.
 *
 * Exposes memory pressure, storage stats, render budget status, and
 * startup profile for the debug panel and any UI that needs to adapt
 * to device constraints.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { PerformanceMonitorState, StorageReport } from '../performance/types';
import {
  getMemoryPressureLevel,
  subscribeMemoryMonitor,
} from '../performance/memory-monitor';
import {
  getStorageReport,
  subscribeStorageOptimizer,
  analyzeStorage
} from '../performance/storage-optimizer';
import {
  getRenderBudgetExceeded,
  subscribeRenderBudget
} from '../performance/render-budget';
import { getStartupProfile } from '../performance/startup-profiler';
import type { MemoryPressureLevel } from '../performance/types';
import type { StartupProfile } from '../performance/types';

/**
 * React hook providing a unified performance monitoring state.
 *
 * Starts the memory monitor on mount and stops it on unmount.
 * Triggers a storage analysis probe on mount.
 */
export function usePerformanceMonitor(): PerformanceMonitorState {
  useEffect(() => {
    void analyzeStorage();
  }, []);

  const memoryPressure: MemoryPressureLevel = useSyncExternalStore(
    subscribeMemoryMonitor,
    getMemoryPressureLevel,
    () => 'none' as const
  );

  const storageReport: StorageReport | null = useSyncExternalStore(
    subscribeStorageOptimizer,
    getStorageReport,
    () => null
  );

  const renderBudgetExceeded: boolean = useSyncExternalStore(
    subscribeRenderBudget,
    getRenderBudgetExceeded,
    () => false
  );

  const startupProfile: StartupProfile | null = getStartupProfile();

  return {
    memoryPressure,
    storageReport,
    renderBudgetExceeded,
    startupProfile
  };
}
