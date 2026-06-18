import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMultiTabLock } from './multi-tab-lock';

describe('MultiTabLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a lock with a unique tab id', () => {
    const lock = createMultiTabLock();
    expect(lock.tabId()).toMatch(/^tab-/);
    lock.destroy();
  });

  it('claims an entry successfully', () => {
    const lock = createMultiTabLock();
    const result = lock.claim('entry-1');
    expect(result).toBe(true);
    lock.destroy();
  });

  it('releases a claimed entry', () => {
    const lock = createMultiTabLock();
    lock.claim('entry-1');
    lock.release('entry-1');
    // After release, same tab can reclaim
    expect(lock.claim('entry-1')).toBe(true);
    lock.destroy();
  });

  it('isClaimedByOther returns false for own claims', () => {
    const lock = createMultiTabLock();
    lock.claim('entry-1');
    expect(lock.isClaimedByOther('entry-1')).toBe(false);
    lock.destroy();
  });

  it('isClaimedByOther returns false for unclaimed entries', () => {
    const lock = createMultiTabLock();
    expect(lock.isClaimedByOther('entry-1')).toBe(false);
    lock.destroy();
  });

  it('destroy cleans up without errors', () => {
    const lock = createMultiTabLock();
    lock.claim('entry-1');
    expect(() => lock.destroy()).not.toThrow();
  });

  it('works without BroadcastChannel', () => {
    // BroadcastChannel is already undefined in Node/vitest by default
    const lock = createMultiTabLock();
    const result = lock.claim('entry-1');
    expect(result).toBe(true);
    expect(lock.isClaimedByOther('entry-1')).toBe(false);
    lock.destroy();
  });
});
