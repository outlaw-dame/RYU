/**
 * Phase 37 -- Image loader.
 *
 * Provides lazy loading via IntersectionObserver, progressive cover
 * image loading, and a memory-conscious in-memory cache with configurable
 * size limits. Designed for book cover images which dominate visual
 * memory in list/grid views.
 *
 * Falls back gracefully when IntersectionObserver is unavailable
 * (rare, but possible in older WebViews).
 */

import type { PerformanceBudget } from './types';
import { DEFAULT_PERFORMANCE_BUDGET } from './types';

export interface ImageLoadOptions {
  /** Root margin for IntersectionObserver (default '200px'). */
  rootMargin?: string;
  /** Visibility threshold for triggering load (default 0.01). */
  threshold?: number;
  /** If true, load a low-quality placeholder first. */
  progressive?: boolean;
  /** Optional low-quality image URL for progressive loading. */
  placeholderSrc?: string;
}

export interface ImageCacheEntry {
  src: string;
  /** Object URL or data URL of the loaded image. */
  blobUrl: string;
  /** Approximate size in bytes. */
  sizeBytes: number;
  /** Monotonic access counter for LRU eviction. */
  lastAccessedAt: number;
}

/** In-memory image cache with LRU eviction. */
const cache = new Map<string, ImageCacheEntry>();
let maxCacheSize: number = DEFAULT_PERFORMANCE_BUDGET.maxImageCacheSize;
let accessCounter = 0;

/**
 * Configure the image cache size limit.
 */
export function configureImageCache(budget?: Partial<PerformanceBudget>): void {
  maxCacheSize = budget?.maxImageCacheSize ?? DEFAULT_PERFORMANCE_BUDGET.maxImageCacheSize;
  evictIfOverLimit();
}

/**
 * Get a cached image blob URL, if available.
 */
export function getCachedImage(src: string): string | undefined {
  const entry = cache.get(src);
  if (entry) {
    entry.lastAccessedAt = ++accessCounter;
    return entry.blobUrl;
  }
  return undefined;
}

/**
 * Store an image in the cache. Evicts LRU entries when the limit is reached.
 */
export function cacheImage(src: string, blobUrl: string, sizeBytes: number): void {
  cache.set(src, {
    src,
    blobUrl,
    sizeBytes,
    lastAccessedAt: ++accessCounter
  });
  evictIfOverLimit();
}

/**
 * Get the current cache size.
 */
export function getImageCacheSize(): number {
  return cache.size;
}

/**
 * Clear the entire image cache. Call during memory pressure.
 */
export function clearImageCache(): void {
  // Revoke object URLs to release memory.
  for (const entry of cache.values()) {
    try {
      if (entry.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(entry.blobUrl);
      }
    } catch {
      // Non-fatal.
    }
  }
  cache.clear();
}

/**
 * Create a lazy-loading observer for image elements.
 * Returns a disconnect function. Each observed element should have
 * a `data-src` attribute with the full image URL.
 *
 * When IntersectionObserver is unavailable, loads all images immediately.
 */
export function createLazyImageObserver(
  options: ImageLoadOptions = {},
  onLoad?: (element: Element, src: string) => void
): { observe: (el: Element) => void; disconnect: () => void } {
  const rootMargin = options.rootMargin ?? '200px';
  const threshold = options.threshold ?? 0.01;

  if (typeof IntersectionObserver === 'undefined') {
    // Fallback: load immediately.
    return {
      observe: (el: Element) => {
        const src = el.getAttribute('data-src');
        if (src) {
          loadImage(el, src, options);
          onLoad?.(el, src);
        }
      },
      disconnect: () => {}
    };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target;
          const src = el.getAttribute('data-src');
          if (src) {
            observer.unobserve(el);
            loadImage(el, src, options);
            onLoad?.(el, src);
          }
        }
      }
    },
    { rootMargin, threshold }
  );

  return {
    observe: (el: Element) => observer.observe(el),
    disconnect: () => observer.disconnect()
  };
}

/**
 * Reset image loader state. Intended for tests.
 */
export function resetImageLoader(): void {
  clearImageCache();
  maxCacheSize = DEFAULT_PERFORMANCE_BUDGET.maxImageCacheSize;
  accessCounter = 0;
}

// -- Internal helpers --

function loadImage(element: Element, src: string, options: ImageLoadOptions): void {
  // Check cache first.
  const cached = getCachedImage(src);
  if (cached) {
    applyImageSrc(element, cached);
    return;
  }

  // Progressive: apply placeholder immediately if available.
  if (options.progressive && options.placeholderSrc) {
    applyImageSrc(element, options.placeholderSrc);
  }

  // Load the full image.
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => {
      applyImageSrc(element, src);
      // Estimate size (width * height * 4 bytes for RGBA).
      const sizeEstimate = (img.naturalWidth || 100) * (img.naturalHeight || 100) * 4;
      cacheImage(src, src, sizeEstimate);
    };
    img.onerror = () => {
      // On error, just apply src directly and let the browser show the broken state.
      applyImageSrc(element, src);
    };
    img.src = src;
  } else {
    applyImageSrc(element, src);
  }
}

function applyImageSrc(element: Element, src: string): void {
  if (element instanceof HTMLImageElement) {
    element.src = src;
  } else {
    element.setAttribute('src', src);
  }
  element.removeAttribute('data-src');
}

function evictIfOverLimit(): void {
  while (cache.size > maxCacheSize) {
    // Find the least recently accessed entry.
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const entry = cache.get(oldestKey);
      if (entry?.blobUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(entry.blobUrl);
        } catch {
          // Non-fatal.
        }
      }
      cache.delete(oldestKey);
    } else {
      break;
    }
  }
}
