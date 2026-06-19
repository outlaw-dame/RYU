import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheImage,
  clearImageCache,
  configureImageCache,
  createLazyImageObserver,
  getCachedImage,
  getImageCacheSize,
  resetImageLoader
} from '../image-loader';

beforeEach(() => {
  resetImageLoader();
});

afterEach(() => {
  resetImageLoader();
  vi.unstubAllGlobals();
});

describe('image-loader', () => {
  describe('image cache', () => {
    it('stores and retrieves cached images', () => {
      cacheImage('https://example.com/cover.jpg', 'blob:abc123', 1000);
      expect(getCachedImage('https://example.com/cover.jpg')).toBe('blob:abc123');
    });

    it('returns undefined for uncached images', () => {
      expect(getCachedImage('https://example.com/missing.jpg')).toBeUndefined();
    });

    it('reports correct cache size', () => {
      expect(getImageCacheSize()).toBe(0);
      cacheImage('a.jpg', 'blob:a', 100);
      cacheImage('b.jpg', 'blob:b', 100);
      expect(getImageCacheSize()).toBe(2);
    });

    it('evicts LRU entries when cache exceeds max size', () => {
      configureImageCache({ maxImageCacheSize: 3 });

      cacheImage('a.jpg', 'a', 100);
      cacheImage('b.jpg', 'b', 100);
      cacheImage('c.jpg', 'c', 100);

      // Access 'a' to make it most recently used.
      getCachedImage('a.jpg');

      // Adding a fourth should evict 'b' (least recently accessed).
      cacheImage('d.jpg', 'd', 100);
      expect(getImageCacheSize()).toBe(3);
      expect(getCachedImage('a.jpg')).toBe('a');
      expect(getCachedImage('b.jpg')).toBeUndefined();
      expect(getCachedImage('c.jpg')).toBe('c');
      expect(getCachedImage('d.jpg')).toBe('d');
    });

    it('clears the entire cache', () => {
      cacheImage('a.jpg', 'blob:a', 100);
      cacheImage('b.jpg', 'blob:b', 100);
      clearImageCache();
      expect(getImageCacheSize()).toBe(0);
      expect(getCachedImage('a.jpg')).toBeUndefined();
    });

    it('revokes blob URLs when clearing cache', () => {
      const revokeSpy = vi.fn();
      vi.stubGlobal('URL', { ...URL, revokeObjectURL: revokeSpy });
      cacheImage('a.jpg', 'blob:test', 100);
      clearImageCache();
      expect(revokeSpy).toHaveBeenCalledWith('blob:test');
    });
  });

  describe('createLazyImageObserver', () => {
    it('loads images immediately when IntersectionObserver is unavailable', () => {
      // Remove IntersectionObserver.
      const original = globalThis.IntersectionObserver;
      // @ts-expect-error -- intentionally removing for test
      delete globalThis.IntersectionObserver;

      try {
        const onLoad = vi.fn();
        const observer = createLazyImageObserver({}, onLoad);

        const el = document.createElement('img');
        el.setAttribute('data-src', 'https://example.com/cover.jpg');
        observer.observe(el);

        expect(onLoad).toHaveBeenCalledWith(el, 'https://example.com/cover.jpg');
      } finally {
        globalThis.IntersectionObserver = original;
      }
    });

    it('observes elements and loads on intersection', () => {
      let intersectionCallback: IntersectionObserverCallback | null = null;
      const observeMock = vi.fn();
      const unobserveMock = vi.fn();
      const disconnectMock = vi.fn();

      vi.stubGlobal(
        'IntersectionObserver',
        class MockIntersectionObserver {
          constructor(callback: IntersectionObserverCallback) {
            intersectionCallback = callback;
          }
          observe = observeMock;
          unobserve = unobserveMock;
          disconnect = disconnectMock;
        }
      );

      const onLoad = vi.fn();
      const { observe, disconnect } = createLazyImageObserver(
        { rootMargin: '100px', threshold: 0.1 },
        onLoad
      );

      const el = document.createElement('img');
      el.setAttribute('data-src', 'https://example.com/cover.jpg');
      observe(el);

      expect(observeMock).toHaveBeenCalledWith(el);

      // Simulate intersection.
      intersectionCallback!(
        [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );

      expect(unobserveMock).toHaveBeenCalledWith(el);
      expect(onLoad).toHaveBeenCalledWith(el, 'https://example.com/cover.jpg');

      disconnect();
      expect(disconnectMock).toHaveBeenCalled();
    });

    it('does not trigger for non-intersecting entries', () => {
      let intersectionCallback: IntersectionObserverCallback | null = null;

      vi.stubGlobal(
        'IntersectionObserver',
        class MockIntersectionObserver {
          constructor(callback: IntersectionObserverCallback) {
            intersectionCallback = callback;
          }
          observe = vi.fn();
          unobserve = vi.fn();
          disconnect = vi.fn();
        }
      );

      const onLoad = vi.fn();
      const { observe } = createLazyImageObserver({}, onLoad);

      const el = document.createElement('img');
      el.setAttribute('data-src', 'https://example.com/cover.jpg');
      observe(el);

      intersectionCallback!(
        [{ isIntersecting: false, target: el } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );

      expect(onLoad).not.toHaveBeenCalled();
    });
  });
});
