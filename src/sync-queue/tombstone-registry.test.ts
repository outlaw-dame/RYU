import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTombstoneRegistry } from './tombstone-registry';

describe('TombstoneRegistry', () => {
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

  it('adds and checks tombstones', () => {
    const registry = createTombstoneRegistry({ storageKey: 'test:ts' });

    expect(registry.isTombstoned('review', 'r1')).toBe(false);

    registry.add('review', 'r1', 'user deleted');

    expect(registry.isTombstoned('review', 'r1')).toBe(true);
    expect(registry.get('review', 'r1')?.reason).toBe('user deleted');
  });

  it('persists tombstones to localStorage', () => {
    const registry = createTombstoneRegistry({ storageKey: 'test:ts' });
    registry.add('edition', 'e1');

    const stored = JSON.parse(storage['test:ts']);
    expect(stored).toHaveLength(1);
    expect(stored[0].entityType).toBe('edition');
    expect(stored[0].entityId).toBe('e1');
  });

  it('loads tombstones from localStorage', () => {
    storage['test:ts'] = JSON.stringify([
      { entityType: 'review', entityId: 'r1', deletedAt: '2024-01-01T00:00:00.000Z' },
    ]);

    const registry = createTombstoneRegistry({ storageKey: 'test:ts' });
    expect(registry.isTombstoned('review', 'r1')).toBe(true);
  });

  it('removes tombstones', () => {
    const registry = createTombstoneRegistry({ storageKey: 'test:ts' });
    registry.add('review', 'r1');
    expect(registry.isTombstoned('review', 'r1')).toBe(true);

    registry.remove('review', 'r1');
    expect(registry.isTombstoned('review', 'r1')).toBe(false);
  });

  it('lists all tombstones', () => {
    const registry = createTombstoneRegistry({ storageKey: 'test:ts' });
    registry.add('review', 'r1');
    registry.add('edition', 'e1');

    const all = registry.all();
    expect(all).toHaveLength(2);
  });

  it('prunes old tombstones', () => {
    const registry = createTombstoneRegistry({ storageKey: 'test:ts' });

    // Directly write an old tombstone
    storage['test:ts'] = JSON.stringify([
      { entityType: 'review', entityId: 'old', deletedAt: '2020-01-01T00:00:00.000Z' },
    ]);

    const freshRegistry = createTombstoneRegistry({ storageKey: 'test:ts' });
    freshRegistry.add('review', 'recent');

    const pruned = freshRegistry.prune(1000); // 1 second max age
    expect(pruned).toBe(1);
    expect(freshRegistry.isTombstoned('review', 'old')).toBe(false);
    expect(freshRegistry.isTombstoned('review', 'recent')).toBe(true);
  });

  it('notifies subscribers on changes', () => {
    const registry = createTombstoneRegistry({ storageKey: 'test:ts' });
    const listener = vi.fn();
    registry.subscribe(listener);

    registry.add('review', 'r1');
    expect(listener).toHaveBeenCalledTimes(1);

    registry.remove('review', 'r1');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
