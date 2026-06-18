import { describe, expect, it } from 'vitest';
import { computeQueueHealth, formatQueueHealth, isQueueHealthy, needsAttention } from './queue-health';
import type { QueueEntry } from './types';

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'entry-1',
    operation: 'review:create',
    entityType: 'review',
    entityId: 'r1',
    payload: '{}',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    enqueuedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    dedupeKey: 'review:create::r1',
    ...overrides,
  };
}

describe('computeQueueHealth', () => {
  it('counts entries by status', () => {
    const entries = [
      makeEntry({ id: '1', status: 'pending' }),
      makeEntry({ id: '2', status: 'pending' }),
      makeEntry({ id: '3', status: 'processing' }),
      makeEntry({ id: '4', status: 'completed', updatedAt: '2024-06-01T00:00:00.000Z' }),
      makeEntry({ id: '5', status: 'failed', error: { message: 'err', stage: 'network', recoverable: true, timestamp: '2024-06-01T12:00:00.000Z' } }),
    ];

    const health = computeQueueHealth(entries);

    expect(health.pending).toBe(2);
    expect(health.processing).toBe(1);
    expect(health.completed).toBe(1);
    expect(health.failed).toBe(1);
  });

  it('finds the oldest entry', () => {
    const entries = [
      makeEntry({ id: '1', enqueuedAt: '2024-03-01T00:00:00.000Z' }),
      makeEntry({ id: '2', enqueuedAt: '2024-01-01T00:00:00.000Z' }),
      makeEntry({ id: '3', enqueuedAt: '2024-06-01T00:00:00.000Z' }),
    ];

    const health = computeQueueHealth(entries);
    expect(health.oldestEntryAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('tracks last error and last success', () => {
    const entries = [
      makeEntry({ id: '1', status: 'completed', updatedAt: '2024-06-01T10:00:00.000Z' }),
      makeEntry({ id: '2', status: 'completed', updatedAt: '2024-06-01T12:00:00.000Z' }),
      makeEntry({
        id: '3', status: 'failed',
        error: { message: 'timeout', stage: 'network', recoverable: true, timestamp: '2024-06-01T11:00:00.000Z' },
      }),
    ];

    const health = computeQueueHealth(entries);
    expect(health.lastSuccessAt).toBe('2024-06-01T12:00:00.000Z');
    expect(health.lastErrorAt).toBe('2024-06-01T11:00:00.000Z');
    expect(health.lastError?.message).toBe('timeout');
  });

  it('returns nulls for empty queue', () => {
    const health = computeQueueHealth([]);
    expect(health.pending).toBe(0);
    expect(health.oldestEntryAt).toBeNull();
    expect(health.lastErrorAt).toBeNull();
    expect(health.lastSuccessAt).toBeNull();
    expect(health.lastError).toBeNull();
  });
});

describe('formatQueueHealth', () => {
  it('formats a health snapshot to a readable string', () => {
    const health = computeQueueHealth([
      makeEntry({ status: 'pending' }),
      makeEntry({ id: '2', status: 'failed', error: { message: 'oops', stage: 'network', recoverable: true, timestamp: '2024-01-01T00:00:00.000Z' } }),
    ]);

    const formatted = formatQueueHealth(health);
    expect(formatted).toContain('Pending: 1');
    expect(formatted).toContain('Failed: 1');
    expect(formatted).toContain('oops');
  });
});

describe('isQueueHealthy', () => {
  it('returns true when no failed or processing entries', () => {
    const health = computeQueueHealth([
      makeEntry({ status: 'completed' }),
    ]);
    expect(isQueueHealthy(health)).toBe(true);
  });

  it('returns false when there are failed entries', () => {
    const health = computeQueueHealth([
      makeEntry({ status: 'failed' }),
    ]);
    expect(isQueueHealthy(health)).toBe(false);
  });
});

describe('needsAttention', () => {
  it('returns false when no failed entries', () => {
    const health = computeQueueHealth([makeEntry({ status: 'pending' })]);
    expect(needsAttention(health)).toBe(false);
  });

  it('returns true when there are failed entries', () => {
    const health = computeQueueHealth([
      makeEntry({ status: 'failed', error: { message: 'err', stage: 'network', recoverable: true, timestamp: '2024-01-01T00:00:00.000Z' } }),
    ]);
    expect(needsAttention(health)).toBe(true);
  });
});
