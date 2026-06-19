import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginFrame,
  configureRenderBudget,
  elapsedInFrame,
  getRenderBudgetExceeded,
  isWithinBudget,
  resetRenderBudget,
  runWithBudget,
  subscribeRenderBudget,
  yieldToMain
} from '../render-budget';

beforeEach(() => {
  resetRenderBudget();
});

afterEach(() => {
  resetRenderBudget();
  vi.useRealTimers();
});

describe('render-budget', () => {
  describe('beginFrame / isWithinBudget', () => {
    it('starts within budget after beginFrame()', () => {
      beginFrame();
      expect(isWithinBudget()).toBe(true);
      expect(getRenderBudgetExceeded()).toBe(false);
    });

    it('exceeds budget after maxFrameBudgetMs has elapsed', () => {
      // Configure a tiny budget for testability.
      configureRenderBudget({ maxFrameBudgetMs: 1 });
      beginFrame();

      // Busy-wait to exceed budget.
      const start = performance.now();
      while (performance.now() - start < 2) {
        // spin
      }

      expect(isWithinBudget()).toBe(false);
      expect(getRenderBudgetExceeded()).toBe(true);
    });
  });

  describe('elapsedInFrame', () => {
    it('returns elapsed time since beginFrame()', () => {
      beginFrame();
      const elapsed = elapsedInFrame();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(100); // Should be near-instant in tests.
    });
  });

  describe('yieldToMain', () => {
    it('resolves and resets frame start', async () => {
      configureRenderBudget({ maxFrameBudgetMs: 1 });
      beginFrame();

      // Busy-wait past budget.
      const start = performance.now();
      while (performance.now() - start < 2) {
        // spin
      }
      expect(isWithinBudget()).toBe(false);

      await yieldToMain();
      // After yield, frame resets.
      expect(isWithinBudget()).toBe(true);
    });

    it('uses setTimeout when scheduler.yield is unavailable', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      beginFrame();
      await yieldToMain();
      expect(setTimeoutSpy).toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });
  });

  describe('runWithBudget', () => {
    it('provides shouldYield and yieldNow helpers', async () => {
      configureRenderBudget({ maxFrameBudgetMs: 1 });

      let yieldCount = 0;
      await runWithBudget(async ({ shouldYield, yieldNow }) => {
        for (let i = 0; i < 5; i++) {
          // Simulate work.
          const start = performance.now();
          while (performance.now() - start < 0.5) {
            // spin
          }
          if (shouldYield()) {
            yieldCount++;
            await yieldNow();
          }
        }
      });

      // Should have yielded at least once given the tiny budget.
      expect(yieldCount).toBeGreaterThan(0);
    });
  });

  describe('subscribeRenderBudget', () => {
    it('notifies listeners when budget is exceeded', () => {
      configureRenderBudget({ maxFrameBudgetMs: 1 });
      const listener = vi.fn();
      subscribeRenderBudget(listener);

      beginFrame();
      // Busy-wait.
      const start = performance.now();
      while (performance.now() - start < 2) {
        // spin
      }
      isWithinBudget();
      expect(listener).toHaveBeenCalled();
    });

    it('returns an unsubscribe function', () => {
      configureRenderBudget({ maxFrameBudgetMs: 1 });
      const listener = vi.fn();
      const unsubscribe = subscribeRenderBudget(listener);
      unsubscribe();

      beginFrame();
      const start = performance.now();
      while (performance.now() - start < 2) {
        // spin
      }
      isWithinBudget();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
