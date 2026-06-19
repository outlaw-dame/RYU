import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureStartupProfile,
  getRecordedMetrics,
  getStartupProfile,
  markCriticalPathEnd,
  markCriticalPathStart,
  markLazyLoadEnd,
  markLazyLoadStart,
  recordMetric,
  resetStartupProfiler
} from '../startup-profiler';

beforeEach(() => {
  resetStartupProfiler();
});

afterEach(() => {
  resetStartupProfiler();
  vi.unstubAllGlobals();
});

describe('startup-profiler', () => {
  describe('critical path marks', () => {
    it('captures critical path duration', () => {
      markCriticalPathStart();
      // Simulate a small delay via busy-wait.
      const start = performance.now();
      while (performance.now() - start < 1) {
        // spin
      }
      markCriticalPathEnd();

      const profile = captureStartupProfile();
      expect(profile.criticalPathMs).toBeGreaterThan(0);
      expect(profile.criticalPathMs).toBeLessThan(100);
    });

    it('returns undefined when marks are not set', () => {
      const profile = captureStartupProfile();
      expect(profile.criticalPathMs).toBeUndefined();
    });
  });

  describe('lazy load marks', () => {
    it('captures lazy load duration', () => {
      markLazyLoadStart();
      const start = performance.now();
      while (performance.now() - start < 1) {
        // spin
      }
      markLazyLoadEnd();

      const profile = captureStartupProfile();
      expect(profile.lazyLoadMs).toBeGreaterThan(0);
    });

    it('returns undefined when marks are not set', () => {
      const profile = captureStartupProfile();
      expect(profile.lazyLoadMs).toBeUndefined();
    });
  });

  describe('captureStartupProfile', () => {
    it('includes capturedAt timestamp', () => {
      const profile = captureStartupProfile();
      expect(profile.capturedAt).toBeDefined();
      expect(new Date(profile.capturedAt).getTime()).not.toBeNaN();
    });

    it('returns cached profile on subsequent calls', () => {
      markCriticalPathStart();
      markCriticalPathEnd();
      const first = captureStartupProfile();
      const second = captureStartupProfile();
      expect(first).toBe(second);
    });

    it('records critical-path metric', () => {
      markCriticalPathStart();
      markCriticalPathEnd();
      captureStartupProfile();

      const metrics = getRecordedMetrics();
      expect(metrics.some((m) => m.name === 'critical-path')).toBe(true);
    });

    it('records lazy-load metric', () => {
      markLazyLoadStart();
      markLazyLoadEnd();
      captureStartupProfile();

      const metrics = getRecordedMetrics();
      expect(metrics.some((m) => m.name === 'lazy-load')).toBe(true);
    });
  });

  describe('getStartupProfile', () => {
    it('returns null before capture', () => {
      expect(getStartupProfile()).toBeNull();
    });

    it('returns profile after capture', () => {
      captureStartupProfile();
      expect(getStartupProfile()).not.toBeNull();
    });
  });

  describe('recordMetric', () => {
    it('adds metric to the recorded list', () => {
      recordMetric({
        name: 'search-render',
        durationMs: 42,
        timestamp: new Date().toISOString()
      });
      const metrics = getRecordedMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('search-render');
      expect(metrics[0].durationMs).toBe(42);
    });
  });

  describe('resetStartupProfiler', () => {
    it('clears all state', () => {
      markCriticalPathStart();
      markCriticalPathEnd();
      recordMetric({
        name: 'test',
        durationMs: 10,
        timestamp: new Date().toISOString()
      });
      captureStartupProfile();

      resetStartupProfiler();

      expect(getRecordedMetrics()).toHaveLength(0);
      expect(getStartupProfile()).toBeNull();
    });
  });
});
