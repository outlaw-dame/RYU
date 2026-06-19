import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMemoryPressureLevel,
  getMemorySnapshot,
  resetMemoryMonitor,
  sampleMemoryNow,
  startMemoryMonitor,
  stopMemoryMonitor,
  subscribeMemoryMonitor
} from '../memory-monitor';

beforeEach(() => {
  resetMemoryMonitor();
  vi.useFakeTimers();
});

afterEach(() => {
  resetMemoryMonitor();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setPerformance(value: unknown): void {
  Object.defineProperty(globalThis, 'performance', {
    value: { ...performance, ...value as object },
    configurable: true,
    writable: true
  });
}

describe('memory-monitor', () => {
  describe('getMemoryPressureLevel', () => {
    it('returns "none" when performance.memory is unavailable', () => {
      setPerformance({});
      resetMemoryMonitor();
      expect(getMemoryPressureLevel()).toBe('none');
    });

    it('returns "none" when heap usage is below moderate threshold', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 4_000_000_000,
          usedJSHeapSize: 1_000_000_000
        },
        now: performance.now.bind(performance)
      });
      resetMemoryMonitor();
      expect(getMemoryPressureLevel()).toBe('none');
    });

    it('returns "moderate" when usage ratio exceeds 0.7', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 750_000_000
        },
        now: performance.now.bind(performance)
      });
      resetMemoryMonitor();
      expect(getMemoryPressureLevel()).toBe('moderate');
    });

    it('returns "critical" when usage ratio exceeds 0.9', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 950_000_000
        },
        now: performance.now.bind(performance)
      });
      resetMemoryMonitor();
      expect(getMemoryPressureLevel()).toBe('critical');
    });
  });

  describe('sampleMemoryNow', () => {
    it('notifies listeners when pressure level changes', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 100_000_000
        },
        now: performance.now.bind(performance)
      });
      resetMemoryMonitor();

      const listener = vi.fn();
      subscribeMemoryMonitor(listener);

      // Change pressure to moderate.
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 800_000_000
        },
        now: performance.now.bind(performance)
      });
      sampleMemoryNow();
      expect(listener).toHaveBeenCalled();
    });

    it('does not notify when pressure level stays the same', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 100_000_000
        },
        now: performance.now.bind(performance)
      });
      resetMemoryMonitor();

      const listener = vi.fn();
      subscribeMemoryMonitor(listener);

      // Same values -- no notification.
      sampleMemoryNow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('startMemoryMonitor / stopMemoryMonitor', () => {
    it('polls at the configured interval', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 100_000_000
        },
        now: performance.now.bind(performance)
      });

      const listener = vi.fn();
      // subscribeMemoryMonitor auto-starts the monitor
      const unsub = subscribeMemoryMonitor(listener);

      vi.advanceTimersByTime(5000);

      // Change the values to trigger notification.
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 800_000_000
        },
        now: performance.now.bind(performance)
      });
      vi.advanceTimersByTime(5000);
      expect(listener).toHaveBeenCalled();

      unsub();
      listener.mockClear();

      vi.advanceTimersByTime(5000);
      expect(listener).not.toHaveBeenCalled();
    });

    it('does not start multiple intervals', () => {
      startMemoryMonitor(1000);
      startMemoryMonitor(1000);
      stopMemoryMonitor();
      // If two intervals were started, this would still fire.
      const listener = vi.fn();
      subscribeMemoryMonitor(listener);
      vi.advanceTimersByTime(5000);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('subscribeMemoryMonitor', () => {
    it('returns an unsubscribe function', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 100_000_000
        },
        now: performance.now.bind(performance)
      });
      resetMemoryMonitor();

      const listener = vi.fn();
      const unsubscribe = subscribeMemoryMonitor(listener);
      unsubscribe();

      setPerformance({
        memory: {
          jsHeapSizeLimit: 1_000_000_000,
          usedJSHeapSize: 950_000_000
        },
        now: performance.now.bind(performance)
      });
      sampleMemoryNow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getMemorySnapshot', () => {
    it('returns full snapshot with usage ratio', () => {
      setPerformance({
        memory: {
          jsHeapSizeLimit: 2_000_000_000,
          usedJSHeapSize: 1_000_000_000
        },
        now: performance.now.bind(performance)
      });
      resetMemoryMonitor();

      const snapshot = getMemorySnapshot();
      expect(snapshot.usedBytes).toBe(1_000_000_000);
      expect(snapshot.limitBytes).toBe(2_000_000_000);
      expect(snapshot.usageRatio).toBe(0.5);
      expect(snapshot.level).toBe('none');
      expect(snapshot.timestamp).toBeDefined();
    });
  });
});
