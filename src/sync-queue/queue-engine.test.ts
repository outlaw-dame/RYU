import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeBackoffMs, createSyncQueueEngine, deriveDedupeKey } from './queue-engine';
import type { QueueEntry, QueueError } from './types';

describe('computeBackoffMs', () => {
  it('returns base ms for 0 attempts', () => {
    const result = computeBackoffMs(0, 1000, 60000);
    // base * 2^0 = 1000, plus jitter (0-250)
    expect(result).toBeGreaterThanOrEqual(1000);
    expect(result).toBeLessThanOrEqual(1250);
  });

  it('grows exponentially', () => {
    const a1 = computeBackoffMs(1, 1000, 60000);
    const a3 = computeBackoffMs(3, 1000, 60000);
    // 2^1=2000 vs 2^3=8000 (before jitter)
    expect(a3).toBeGreaterThan(a1);
  });

  it('caps at maxMs', () => {
    const result = computeBackoffMs(20, 1000, 5000);
    // Should not exceed max + max jitter
    expect(result).toBeLessThanOrEqual(6000);
  });
});

describe('deriveDedupeKey', () => {
  it('combines operation and entityId', () => {
    expect(deriveDedupeKey('review:create', 'abc123')).toBe('review:create::abc123');
  });
});

describe('createSyncQueueEngine', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enqueues an entry and persists it', () => {
    const engine = createSyncQueueEngine({ storagePrefix: 'test:q' });

    const entry = engine.enqueue({
      operation: 'review:create',
      entityType: 'review',
      entityId: 'r1',
      payload: '{"title":"test"}',
    });

    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('pending');
    expect(entry!.dedupeKey).toBe('review:create::r1');
    expect(storage['test:q']).toContain('r1');
  });

  it('deduplicates entries with the same operation and entityId', () => {
    const engine = createSyncQueueEngine({ storagePrefix: 'test:q' });

    const first = engine.enqueue({
      operation: 'review:create',
      entityType: 'review',
      entityId: 'r1',
      payload: '{}',
    });
    const second = engine.enqueue({
      operation: 'review:create',
      entityType: 'review',
      entityId: 'r1',
      payload: '{}',
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('allows re-enqueue after completion', async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    const engine = createSyncQueueEngine({
      storagePrefix: 'test:q',
      executor,
    });

    engine.enqueue({
      operation: 'review:update',
      entityType: 'review',
      entityId: 'r1',
      payload: '{}',
    });

    engine.start();
    await engine.idle();

    // Entry is now completed, should allow new enqueue
    const second = engine.enqueue({
      operation: 'review:update',
      entityType: 'review',
      entityId: 'r1',
      payload: '{"v":2}',
    });

    expect(second).not.toBeNull();
  });

  it('processes entries with the executor', async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    const engine = createSyncQueueEngine({
      storagePrefix: 'test:q',
      executor,
    });

    engine.enqueue({
      operation: 'sync:push',
      entityType: 'edition',
      entityId: 'e1',
      payload: '{"data":"value"}',
    });

    engine.start();
    await engine.idle();

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[0][0].entityId).toBe('e1');

    const entries = engine.entries('completed');
    expect(entries).toHaveLength(1);
  });

  it('retries on failure with backoff', async () => {
    let callCount = 0;
    const executor = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error('network error');
    });

    const engine = createSyncQueueEngine({
      storagePrefix: 'test:q',
      executor,
      maxAttempts: 5,
      baseBackoffMs: 10,
      maxBackoffMs: 50,
    });

    engine.enqueue({
      operation: 'sync:push',
      entityType: 'review',
      entityId: 'r1',
      payload: '{}',
    });

    engine.start();

    // Wait long enough for retries with backoff to complete
    await new Promise((r) => setTimeout(r, 300));

    // Should have retried and eventually succeeded
    expect(callCount).toBe(3);
    expect(engine.entries('completed')).toHaveLength(1);
  });

  it('marks entry as failed after max attempts', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('permanent failure'));
    const engine = createSyncQueueEngine({
      storagePrefix: 'test:q',
      executor,
      maxAttempts: 1,
    });

    engine.enqueue({
      operation: 'sync:push',
      entityType: 'review',
      entityId: 'r1',
      payload: '{}',
    });

    engine.start();
    await engine.idle();

    const failed = engine.entries('failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].error?.message).toBe('permanent failure');
    expect(failed[0].error?.recoverable).toBe(false);
  });

  it('reports health correctly', () => {
    const engine = createSyncQueueEngine({ storagePrefix: 'test:q' });

    engine.enqueue({ operation: 'a', entityType: 'x', entityId: '1', payload: '{}' });
    engine.enqueue({ operation: 'b', entityType: 'x', entityId: '2', payload: '{}' });

    const health = engine.health();
    expect(health.pending).toBe(2);
    expect(health.processing).toBe(0);
    expect(health.failed).toBe(0);
    expect(health.completed).toBe(0);
  });

  it('pauses and resumes processing', async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    const engine = createSyncQueueEngine({
      storagePrefix: 'test:q',
      executor,
    });

    engine.enqueue({ operation: 'a', entityType: 'x', entityId: '1', payload: '{}' });
    engine.start();
    await engine.idle();
    expect(executor).toHaveBeenCalledTimes(1);

    engine.pause();
    engine.enqueue({ operation: 'b', entityType: 'x', entityId: '2', payload: '{}' });

    // Should not be processed while paused - verify entry stays pending
    expect(engine.entries('pending')).toHaveLength(1);
    expect(executor).toHaveBeenCalledTimes(1);

    engine.resume();
    await engine.idle();
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('removes entries', () => {
    const engine = createSyncQueueEngine({ storagePrefix: 'test:q' });
    const entry = engine.enqueue({ operation: 'a', entityType: 'x', entityId: '1', payload: '{}' });
    expect(engine.entries()).toHaveLength(1);

    engine.remove(entry!.id);
    expect(engine.entries()).toHaveLength(0);
  });

  it('retries a failed entry', async () => {
    const executor = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);
    const engine = createSyncQueueEngine({
      storagePrefix: 'test:q',
      executor,
      maxAttempts: 1,
    });

    const entry = engine.enqueue({ operation: 'a', entityType: 'x', entityId: '1', payload: '{}' });
    engine.start();
    await engine.idle();

    expect(engine.entries('failed')).toHaveLength(1);

    // Now retry
    engine.retry(entry!.id);
    await engine.idle();

    expect(engine.entries('completed')).toHaveLength(1);
  });

  it('hasPending returns correct values', () => {
    const engine = createSyncQueueEngine({ storagePrefix: 'test:q' });
    expect(engine.hasPending('a', '1')).toBe(false);

    engine.enqueue({ operation: 'a', entityType: 'x', entityId: '1', payload: '{}' });
    expect(engine.hasPending('a', '1')).toBe(true);
  });

  it('subscribe notifies on changes', async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    const engine = createSyncQueueEngine({ storagePrefix: 'test:q', executor });
    const listener = vi.fn();

    engine.subscribe(listener);
    engine.enqueue({ operation: 'a', entityType: 'x', entityId: '1', payload: '{}' });

    expect(listener).toHaveBeenCalled();
  });
});
