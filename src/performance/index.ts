/**
 * Phase 37 -- Performance and storage optimization.
 *
 * Barrel exports for the performance monitoring, storage optimization,
 * render budgeting, and image loading modules.
 */

export type {
  MemoryPressureLevel,
  PerformanceMetric,
  PerformanceBudget,
  StorageReport,
  StartupProfile,
  PerformanceMonitorState
} from './types';
export { DEFAULT_PERFORMANCE_BUDGET } from './types';

export {
  startMemoryMonitor,
  stopMemoryMonitor,
  getMemoryPressureLevel,
  getMemorySnapshot,
  subscribeMemoryMonitor,
  sampleMemoryNow,
  resetMemoryMonitor
} from './memory-monitor';
export type { MemorySnapshot } from './memory-monitor';

export {
  markCriticalPathStart,
  markCriticalPathEnd,
  markLazyLoadStart,
  markLazyLoadEnd,
  recordMetric,
  getRecordedMetrics,
  captureStartupProfile,
  getStartupProfile,
  resetStartupProfiler
} from './startup-profiler';

export {
  analyzeStorage,
  optimizeStorage,
  getStorageReport,
  subscribeStorageOptimizer,
  isStorageUnderPressure,
  resetStorageOptimizer
} from './storage-optimizer';
export type { StorageOptimizationOptions } from './storage-optimizer';

export {
  beginFrame,
  isWithinBudget,
  elapsedInFrame,
  yieldToMain,
  runWithBudget,
  getRenderBudgetExceeded,
  subscribeRenderBudget,
  configureRenderBudget,
  resetRenderBudget
} from './render-budget';

export {
  configureImageCache,
  getCachedImage,
  cacheImage,
  getImageCacheSize,
  clearImageCache,
  createLazyImageObserver,
  resetImageLoader
} from './image-loader';
export type { ImageLoadOptions, ImageCacheEntry } from './image-loader';
