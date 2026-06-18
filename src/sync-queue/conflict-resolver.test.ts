import { describe, expect, it } from 'vitest';
import { createConflictResolver } from './conflict-resolver';
import type { QueueEntry } from './types';

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'entry-1',
    operation: 'review:update',
    entityType: 'review',
    entityId: 'r1',
    payload: '{"title":"old"}',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    enqueuedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    dedupeKey: 'review:update::r1',
    ...overrides,
  };
}

describe('ConflictResolver', () => {
  describe('last-write-wins strategy', () => {
    it('picks the entry with the later updatedAt', () => {
      const resolver = createConflictResolver({ strategy: 'last-write-wins' });

      const existing = makeEntry({ id: 'a', updatedAt: '2024-01-01T00:00:00.000Z' });
      const incoming = makeEntry({ id: 'b', updatedAt: '2024-01-02T00:00:00.000Z' });

      const result = resolver.resolve(existing, incoming);
      expect(result.resolved).toBe(true);
      expect(result.winner?.id).toBe('b');
    });

    it('picks incoming when timestamps are equal', () => {
      const resolver = createConflictResolver({ strategy: 'last-write-wins' });

      const existing = makeEntry({ id: 'a', updatedAt: '2024-01-01T00:00:00.000Z' });
      const incoming = makeEntry({ id: 'b', updatedAt: '2024-01-01T00:00:00.000Z' });

      const result = resolver.resolve(existing, incoming);
      expect(result.resolved).toBe(true);
      expect(result.winner?.id).toBe('b');
    });
  });

  describe('merge strategy', () => {
    it('merges JSON payloads with incoming overriding', () => {
      const resolver = createConflictResolver({ strategy: 'merge' });

      const existing = makeEntry({ id: 'a', payload: '{"title":"old","rating":3}' });
      const incoming = makeEntry({ id: 'b', payload: '{"title":"new"}' });

      const result = resolver.resolve(existing, incoming);
      expect(result.resolved).toBe(true);
      expect(JSON.parse(result.merged!)).toEqual({ title: 'new', rating: 3 });
    });

    it('handles invalid JSON gracefully', () => {
      const resolver = createConflictResolver({ strategy: 'merge' });

      const existing = makeEntry({ payload: 'not json' });
      const incoming = makeEntry({ payload: '{"x":1}' });

      const result = resolver.resolve(existing, incoming);
      expect(result.resolved).toBe(false);
      expect(result.error?.stage).toBe('conflict');
    });

    it('supports a custom merge function', () => {
      const mergeFn = (a: string, b: string) => {
        return JSON.stringify({ combined: true, a: JSON.parse(a), b: JSON.parse(b) });
      };
      const resolver = createConflictResolver({ strategy: 'merge', mergeFn });

      const existing = makeEntry({ payload: '{"x":1}' });
      const incoming = makeEntry({ payload: '{"y":2}' });

      const result = resolver.resolve(existing, incoming);
      expect(result.resolved).toBe(true);
      expect(JSON.parse(result.merged!)).toEqual({ combined: true, a: { x: 1 }, b: { y: 2 } });
    });
  });

  describe('manual strategy', () => {
    it('defers to manual resolution', () => {
      const resolver = createConflictResolver({ strategy: 'manual' });

      const existing = makeEntry({ id: 'a' });
      const incoming = makeEntry({ id: 'b' });

      const result = resolver.resolve(existing, incoming);
      expect(result.resolved).toBe(false);
      expect(result.requiresManual).toBe(true);

      const conflicts = resolver.getManualConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].entityId).toBe('r1');
    });

    it('resolves manual conflicts', () => {
      const resolver = createConflictResolver({ strategy: 'manual' });

      const existing = makeEntry({ id: 'a' });
      const incoming = makeEntry({ id: 'b' });

      resolver.resolve(existing, incoming);
      expect(resolver.getManualConflicts()).toHaveLength(1);

      resolver.resolveManual('r1', 'b');
      expect(resolver.getManualConflicts()).toHaveLength(0);
    });

    it('clears all resolved conflicts', () => {
      const resolver = createConflictResolver({ strategy: 'manual' });
      resolver.resolve(makeEntry({ id: 'a' }), makeEntry({ id: 'b' }));
      resolver.resolve(makeEntry({ id: 'c', entityId: 'r2', dedupeKey: 'x::r2' }), makeEntry({ id: 'd', entityId: 'r2', dedupeKey: 'x::r2' }));

      expect(resolver.getManualConflicts()).toHaveLength(2);
      resolver.clearResolved();
      expect(resolver.getManualConflicts()).toHaveLength(0);
    });
  });
});
