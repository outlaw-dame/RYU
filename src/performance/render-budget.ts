/**
 * Phase 37 -- Render budget.
 *
 * Enforces a 50ms main-thread budget for search operations and other
 * potentially long-running synchronous work. Yields control back to
 * the browser via scheduler.yield() (when available) or setTimeout(0)
 * to prevent frame drops during heavy computation.
 *
 * Integrates with Framework7 page transitions to avoid jank during
 * navigation -- callers can check `isWithinBudget()` before starting
 * expensive work.
 */

import type { PerformanceBudget } from './types';
import { DEFAULT_PERFORMANCE_BUDGET } from './types';

type Scheduler = {
  yield?: () => Promise<void>;
};

let budget: PerformanceBudget = DEFAULT_PERFORMANCE_BUDGET;
let frameStart: number = 0;
let budgetExceeded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function getScheduler(): Scheduler | undefined {
  if (typeof globalThis !== 'undefined' && 'scheduler' in globalThis) {
    return (globalThis as unknown as { scheduler: Scheduler }).scheduler;
  }
  return undefined;
}

/**
 * Mark the start of a new work frame. Call before beginning a batch
 * of synchronous operations that should respect the budget.
 */
export function beginFrame(): void {
  frameStart = performance.now();
  if (budgetExceeded) {
    budgetExceeded = false;
    notify();
  }
}

/**
 * Check whether we are still within the frame budget.
 * Returns false if the elapsed time since beginFrame() exceeds
 * the configured maxFrameBudgetMs.
 */
export function isWithinBudget(): boolean {
  const elapsed = performance.now() - frameStart;
  const within = elapsed < budget.maxFrameBudgetMs;
  if (!within && !budgetExceeded) {
    budgetExceeded = true;
    notify();
  }
  return within;
}

/**
 * Get the elapsed time in ms since the last beginFrame() call.
 */
export function elapsedInFrame(): number {
  return performance.now() - frameStart;
}

/**
 * Yield control back to the browser if the budget has been exceeded.
 * Uses scheduler.yield() when available, falling back to setTimeout(0).
 *
 * Call this between iterations of expensive loops:
 *
 * ```ts
 * beginFrame();
 * for (const item of items) {
 *   processItem(item);
 *   if (!isWithinBudget()) await yieldToMain();
 * }
 * ```
 */
export async function yieldToMain(): Promise<void> {
  const scheduler = getScheduler();
  if (scheduler && typeof scheduler.yield === 'function') {
    await scheduler.yield();
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  // Reset frame after yielding.
  beginFrame();
}

/**
 * Run an async task with automatic yielding at budget boundaries.
 * The `work` callback receives a `shouldYield` function that returns
 * true when the budget is exhausted. The caller must await yieldToMain()
 * when shouldYield returns true.
 */
export async function runWithBudget<T>(
  work: (ctx: { shouldYield: () => boolean; yieldNow: () => Promise<void> }) => Promise<T>
): Promise<T> {
  beginFrame();
  return work({
    shouldYield: () => !isWithinBudget(),
    yieldNow: yieldToMain
  });
}

/**
 * Get whether the current frame budget has been exceeded.
 * (useSyncExternalStore-compatible snapshot.)
 */
export function getRenderBudgetExceeded(): boolean {
  return budgetExceeded;
}

/**
 * Subscribe to render budget state changes (useSyncExternalStore-compatible).
 */
export function subscribeRenderBudget(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Configure the render budget. Call once at app initialization.
 */
export function configureRenderBudget(customBudget?: Partial<PerformanceBudget>): void {
  if (customBudget) {
    budget = { ...DEFAULT_PERFORMANCE_BUDGET, ...customBudget };
  }
}

/**
 * Reset render budget state. Intended for tests.
 */
export function resetRenderBudget(): void {
  budget = DEFAULT_PERFORMANCE_BUDGET;
  frameStart = 0;
  budgetExceeded = false;
  listeners.clear();
}
