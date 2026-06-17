import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock the duplicate detection module
vi.mock('../duplicate-detection', () => ({
  detectDuplicate: vi.fn().mockResolvedValue({ isDuplicate: false })
}));

// Mock the isbn-resolver module
vi.mock('../isbn-resolver', () => ({
  resolveIsbn: vi.fn().mockResolvedValue(null),
  isbnResultToApGraph: vi.fn()
}));

// Mock the DB ingest (lazy import)
vi.mock('../../db/activitypub-ingest', () => ({
  ingestActivityPubGraph: vi.fn().mockResolvedValue(undefined),
  getRxDBActivityPubStore: vi.fn().mockResolvedValue({})
}));

// Mock the resolver (lazy import)
vi.mock('../../sync/resolver', () => ({
  ActivityPubResolver: vi.fn().mockImplementation(() => ({
    importEditionFromUrl: vi.fn().mockResolvedValue({ id: 'resolved-id', title: 'Resolved Title' })
  }))
}));

import { createImportQueue, type ImportQueue } from '../import-queue';
import type { ImportJobEvent } from '../types';

describe('createImportQueue', () => {
  let queue: ImportQueue;
  const events: ImportJobEvent[] = [];

  beforeEach(() => {
    localStorageMock.clear();
    events.length = 0;
    queue = createImportQueue({
      storageKey: 'test:import-queue',
      concurrency: 1,
      maxAttempts: 3,
      onEvent: (event) => events.push(event)
    });
  });

  afterEach(() => {
    queue.stop();
    vi.restoreAllMocks();
  });

  describe('enqueue', () => {
    it('creates a job with pending status for a URL input', () => {
      const job = queue.enqueue('https://bookwyrm.social/book/12345');
      expect(job).not.toBeNull();
      expect(job!.status).toBe('pending');
      expect(job!.source).toBe('bookwyrm');
      expect(job!.input).toBe('https://bookwyrm.social/book/12345');
      expect(job!.attempts).toBe(0);
    });

    it('classifies ISBN input correctly', () => {
      const job = queue.enqueue('978-0-321-12521-7');
      expect(job).not.toBeNull();
      expect(job!.source).toBe('isbn');
    });

    it('classifies 10-digit ISBN correctly', () => {
      const job = queue.enqueue('0321125215');
      expect(job).not.toBeNull();
      expect(job!.source).toBe('isbn');
    });

    it('classifies OpenLibrary URL correctly', () => {
      const job = queue.enqueue('https://openlibrary.org/works/OL1234W');
      expect(job).not.toBeNull();
      expect(job!.source).toBe('openlibrary');
    });

    it('classifies Google Books URL correctly', () => {
      const job = queue.enqueue('https://books.google.com/books?id=abc123');
      expect(job).not.toBeNull();
      expect(job!.source).toBe('google_books');
    });

    it('rejects empty input', () => {
      const job = queue.enqueue('  ');
      expect(job).toBeNull();
    });

    it('detects in-queue duplicates by canonical key', () => {
      const first = queue.enqueue('https://bookwyrm.social/book/12345');
      expect(first).not.toBeNull();

      const second = queue.enqueue('https://bookwyrm.social/book/12345');
      expect(second).toBeNull();

      // Should emit a duplicate event
      const duplicateEvents = events.filter((e) => e.type === 'duplicate');
      expect(duplicateEvents.length).toBe(1);
    });

    it('does not block enqueue when existing job has failed', () => {
      // Create a queue where jobs fail immediately
      const failQueue = createImportQueue({
        storageKey: 'test:fail-then-retry',
        concurrency: 0, // Don't auto-process
        maxAttempts: 1,
        onEvent: (event) => events.push(event)
      });

      const first = failQueue.enqueue('https://bookwyrm.social/book/99');
      expect(first).not.toBeNull();

      // Manually mark as failed in the persisted storage
      const stored = JSON.parse(localStorageMock.setItem.mock.calls.at(-1)![1]);
      stored[stored.length - 1].status = 'failed';
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(stored));

      // Create a new queue that loads the failed job
      const freshQueue = createImportQueue({
        storageKey: 'test:fail-then-retry',
        concurrency: 0,
        maxAttempts: 3
      });

      // Should allow re-enqueueing since the old one is failed
      const second = freshQueue.enqueue('https://bookwyrm.social/book/99');
      expect(second).not.toBeNull();

      failQueue.stop();
      freshQueue.stop();
    });
  });

  describe('snapshot', () => {
    it('returns counts by status', () => {
      queue.enqueue('https://bookwyrm.social/book/1');
      queue.enqueue('https://bookwyrm.social/book/2');

      const snap = queue.snapshot();
      expect(snap.pending).toBe(2);
      expect(snap.processing).toBe(0);
      expect(snap.completed).toBe(0);
      expect(snap.failed).toBe(0);
      expect(snap.jobs.length).toBe(2);
    });
  });

  describe('processing', () => {
    it('processes jobs when started with a custom executor', async () => {
      const executor = vi.fn().mockResolvedValue({ editionId: 'ed-1', title: 'Test' });
      const q = createImportQueue({
        storageKey: 'test:processing',
        executor,
        concurrency: 1,
        maxAttempts: 2,
        onEvent: (event) => events.push(event)
      });

      q.enqueue('https://bookwyrm.social/book/1');
      q.start();

      await q.idle();

      expect(executor).toHaveBeenCalledTimes(1);
      const snap = q.snapshot();
      expect(snap.completed).toBe(1);
      expect(snap.pending).toBe(0);

      q.stop();
    });

    it('marks jobs as failed after max attempts', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Always fails'));

      const q = createImportQueue({
        storageKey: 'test:fail',
        executor,
        concurrency: 1,
        maxAttempts: 1,
        onEvent: (event) => events.push(event)
      });

      q.enqueue('https://bookwyrm.social/book/fail');
      q.start();

      await q.idle();

      const snap = q.snapshot();
      expect(snap.failed).toBe(1);
      expect(snap.jobs[0].lastError).toBe('Always fails');

      q.stop();
    });

    it('retries and eventually succeeds', async () => {
      let callCount = 0;
      const executor = vi.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount < 2) {
          throw new Error('Network error');
        }
        return { editionId: 'ed-retry', title: 'Retry Success' };
      });

      const q = createImportQueue({
        storageKey: 'test:retry-succeed',
        executor,
        concurrency: 1,
        maxAttempts: 3,
        onEvent: (event) => events.push(event)
      });

      q.enqueue('https://bookwyrm.social/book/retry');
      q.start();

      // First attempt fails, then it schedules a retry after backoff
      // We need to wait for the backoff timer
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The job should be pending with attempts=1 after first failure
      let snap = q.snapshot();
      expect(snap.jobs[0].attempts).toBe(1);
      expect(snap.jobs[0].status).toBe('pending');

      // Wait for the retry timer (backoff is 2000ms base + jitter, but in test it uses real timers)
      // Since backoff could be up to ~2500ms, wait sufficiently
      await new Promise((resolve) => setTimeout(resolve, 3000));

      snap = q.snapshot();
      expect(snap.completed).toBe(1);
      expect(executor).toHaveBeenCalledTimes(2);

      q.stop();
    }, 10000);
  });

  describe('persistence', () => {
    it('persists jobs to localStorage', () => {
      queue.enqueue('https://bookwyrm.social/book/persist');
      expect(localStorageMock.setItem).toHaveBeenCalled();

      const stored = JSON.parse(localStorageMock.setItem.mock.calls.at(-1)![1]);
      expect(stored.length).toBe(1);
      expect(stored[0].input).toBe('https://bookwyrm.social/book/persist');
    });

    it('loads jobs from localStorage on creation', () => {
      const existingJobs = [{
        id: 'existing-1',
        source: 'bookwyrm',
        input: 'https://bookwyrm.social/book/old',
        canonicalKey: 'uri:https://bookwyrm.social/book/old',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }];

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(existingJobs));

      const q = createImportQueue({ storageKey: 'test:load' });
      const snap = q.snapshot();
      expect(snap.jobs.length).toBe(1);
      expect(snap.jobs[0].id).toBe('existing-1');
    });

    it('resets processing jobs to pending on reload (resumability)', () => {
      const existingJobs = [{
        id: 'mid-flight',
        source: 'bookwyrm',
        input: 'https://bookwyrm.social/book/mid',
        canonicalKey: 'uri:https://bookwyrm.social/book/mid',
        status: 'processing',
        attempts: 1,
        maxAttempts: 3,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }];

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(existingJobs));

      const q = createImportQueue({ storageKey: 'test:resume' });
      const snap = q.snapshot();
      expect(snap.jobs[0].status).toBe('pending');
    });
  });

  describe('retry', () => {
    it('resets a failed job to pending state', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));
      const q = createImportQueue({
        storageKey: 'test:retry-manual',
        executor,
        concurrency: 1,
        maxAttempts: 1,
        onEvent: (event) => events.push(event)
      });

      q.enqueue('https://bookwyrm.social/book/x');
      q.start();
      await q.idle();

      expect(q.snapshot().failed).toBe(1);

      // Stop the queue so retry doesn't immediately process and fail
      q.stop();

      q.retry(q.snapshot().jobs[0].id);
      expect(q.snapshot().pending).toBe(1);
      expect(q.snapshot().jobs[0].attempts).toBe(0);

      q.stop();
    });
  });

  describe('remove', () => {
    it('removes a job from the queue', () => {
      queue.enqueue('https://bookwyrm.social/book/remove-me');
      expect(queue.snapshot().jobs.length).toBe(1);

      const jobId = queue.snapshot().jobs[0].id;
      queue.remove(jobId);
      expect(queue.snapshot().jobs.length).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on state changes', () => {
      const listener = vi.fn();
      const unsub = queue.subscribe(listener);

      queue.enqueue('https://bookwyrm.social/book/sub');
      expect(listener).toHaveBeenCalled();

      unsub();
    });

    it('stops notifying after unsubscribe', () => {
      const listener = vi.fn();
      const unsub = queue.subscribe(listener);
      unsub();
      listener.mockClear();

      queue.enqueue('https://bookwyrm.social/book/sub2');
      // Listener should not be called after unsub for the enqueue event
      // (Note: enqueue emits an 'enqueued' event which triggers notify)
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
