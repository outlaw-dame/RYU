import { describe, expect, it, vi } from 'vitest';
import { hasCrashedEntries, recoverCrashedEntries } from './crash-recovery';
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

describe('recoverCrashedEntries', () => {
  it('resets entries stuck in processing beyond threshold', () => {
    const stuckEntry = makeEntry({
      id: 'stuck-1',
      status: 'processing',
      claimedAt: new Date(Date.now() - 120_000).toISOString(), // 2 minutes ago
    });
    const entries = [stuckEntry];

    const result = recoverCrashedEntries(entries, { thresholdMs: 60_000 });

    expect(result.recovered).toHaveLength(1);
    expect(result.recovered[0].id).toBe('stuck-1');
    expect(entries[0].status).toBe('pending');
    expect(entries[0].attempts).toBe(1);
    expect(entries[0].nextRetryAt).toBeDefined();
    expect(entries[0].error?.message).toContain('recovered from crashed session');
  });

  it('does not touch entries within threshold', () => {
    const recentEntry = makeEntry({
      status: 'processing',
      claimedAt: new Date(Date.now() - 5_000).toISOString(), // 5 seconds ago
    });
    const entries = [recentEntry];

    const result = recoverCrashedEntries(entries, { thresholdMs: 60_000 });

    expect(result.recovered).toHaveLength(0);
    expect(entries[0].status).toBe('processing');
  });

  it('does not touch pending or completed entries', () => {
    const entries = [
      makeEntry({ status: 'pending' }),
      makeEntry({ id: 'e2', status: 'completed' }),
      makeEntry({ id: 'e3', status: 'failed' }),
    ];

    const result = recoverCrashedEntries(entries, { thresholdMs: 0 });

    expect(result.recovered).toHaveLength(0);
  });

  it('uses updatedAt when claimedAt is not set', () => {
    const stuckEntry = makeEntry({
      status: 'processing',
      updatedAt: new Date(Date.now() - 120_000).toISOString(),
      claimedAt: undefined,
    });
    const entries = [stuckEntry];

    const result = recoverCrashedEntries(entries, { thresholdMs: 60_000 });

    expect(result.recovered).toHaveLength(1);
  });

  it('increments attempts and adds backoff', () => {
    const stuckEntry = makeEntry({
      status: 'processing',
      attempts: 2,
      claimedAt: new Date(Date.now() - 120_000).toISOString(),
    });
    const entries = [stuckEntry];

    recoverCrashedEntries(entries, { thresholdMs: 60_000 });

    expect(entries[0].attempts).toBe(3);
    expect(entries[0].nextRetryAt).toBeDefined();
  });
});

describe('hasCrashedEntries', () => {
  it('returns true when processing entries exceed threshold', () => {
    const entries = [
      makeEntry({
        status: 'processing',
        claimedAt: new Date(Date.now() - 120_000).toISOString(),
      }),
    ];

    expect(hasCrashedEntries(entries, 60_000)).toBe(true);
  });

  it('returns false when no processing entries exceed threshold', () => {
    const entries = [
      makeEntry({
        status: 'processing',
        claimedAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    ];

    expect(hasCrashedEntries(entries, 60_000)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasCrashedEntries([], 60_000)).toBe(false);
  });
});
