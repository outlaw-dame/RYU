/**
 * Phase 26: Persistent import queue with retry/backoff.
 *
 * Manages a queue of import jobs that:
 * - Persists to localStorage so imports survive app reload
 * - Retries failed imports with exponential backoff
 * - Processes jobs concurrently with a configurable limit
 * - Emits events for UI reactivity
 * - Integrates with duplicate detection to avoid re-importing
 */

import { detectDuplicate } from './duplicate-detection';
import { isbnResultToApGraph, resolveIsbn } from './isbn-resolver';
import type { ImportJob, ImportJobEvent, ImportJobStatus, ImportQueueSnapshot, ImportSource } from './types';

export type ImportExecutor = (job: ImportJob) => Promise<{ editionId: string; title?: string }>;

export type ImportQueueOptions = {
  concurrency?: number;
  maxAttempts?: number;
  storageKey?: string;
  executor?: ImportExecutor;
  onEvent?: (event: ImportJobEvent) => void;
};

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_STORAGE_KEY = 'ryu:import-queue';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Compute backoff delay in milliseconds with jitter.
 */
function computeBackoffMs(attempt: number, baseMs = 2000, capMs = 30000): number {
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1)) + jitter;
}

/**
 * Determine the import source from the input string.
 */
function classifyInput(input: string): ImportSource {
  const trimmed = input.trim();

  // ISBN pattern: 10 or 13 digits (possibly with hyphens/spaces)
  const cleaned = trimmed.replace(/[-\s]/g, '');
  if (/^(?:\d{10}|\d{13}|\d{9}[Xx])$/.test(cleaned)) {
    return 'isbn';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (trimmed.includes('openlibrary.org')) return 'openlibrary';
    if (trimmed.includes('books.google.com') || trimmed.includes('googleapis.com')) return 'google_books';
    return 'bookwyrm';
  }

  return 'manual';
}

/**
 * Derive a canonical deduplication key from the input.
 */
function deriveCanonicalKey(input: string, source: ImportSource): string {
  const trimmed = input.trim();

  if (source === 'isbn') {
    return `isbn:${trimmed.replace(/[-\s]/g, '').toUpperCase()}`;
  }

  if (source === 'bookwyrm' || source === 'openlibrary' || source === 'google_books') {
    try {
      const url = new URL(trimmed);
      return `uri:${url.origin}${url.pathname}`.toLowerCase();
    } catch {
      return `raw:${trimmed.toLowerCase()}`;
    }
  }

  return `manual:${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

function loadPersistedJobs(storageKey: string): ImportJob[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ImportJob[];
  } catch {
    return [];
  }
}

function persistJobs(storageKey: string, jobs: ImportJob[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(jobs));
  } catch {
    // Storage full or unavailable - queue still works in-memory
  }
}

export type ImportQueue = {
  /** Add a new import to the queue. Returns the job if enqueued, or null if duplicate. */
  enqueue(input: string): ImportJob | null;
  /** Retry a specific failed job */
  retry(jobId: string): void;
  /** Remove a job from the queue */
  remove(jobId: string): void;
  /** Get the current queue snapshot */
  snapshot(): ImportQueueSnapshot;
  /** Get a specific job by ID */
  getJob(jobId: string): ImportJob | undefined;
  /** Start processing the queue */
  start(): void;
  /** Stop processing (finish current jobs but do not pick up new ones) */
  stop(): void;
  /** Wait until all jobs are idle */
  idle(): Promise<void>;
  /** Subscribe to queue changes (returns unsubscribe function) */
  subscribe(listener: () => void): () => void;
};

export function createImportQueue(options: ImportQueueOptions = {}): ImportQueue {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const executor = options.executor ?? defaultExecutor;
  const onEvent = options.onEvent;

  let jobs: ImportJob[] = loadPersistedJobs(storageKey);
  let running = false;
  let activeCount = 0;
  const activeJobIds = new Set<string>();
  const listeners: Set<() => void> = new Set();
  const idleResolvers: Array<() => void> = [];

  // On load, reset any 'processing' jobs back to 'pending' (app was closed mid-import)
  for (const job of jobs) {
    if (job.status === 'processing') {
      job.status = 'pending';
      job.updatedAt = nowIso();
    }
  }
  persist();

  function persist(): void {
    persistJobs(storageKey, jobs);
  }

  function notify(): void {
    for (const listener of listeners) {
      try { listener(); } catch { /* ignore */ }
    }
  }

  function emitEvent(event: ImportJobEvent): void {
    onEvent?.(event);
    notify();
  }

  function flushIdleResolvers(): void {
    if (activeCount > 0 || getPendingJobs().length > 0) return;
    const resolvers = idleResolvers.splice(0, idleResolvers.length);
    for (const resolve of resolvers) resolve();
  }

  function updateJob(jobId: string, updates: Partial<ImportJob>): void {
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index < 0) return;
    jobs[index] = { ...jobs[index], ...updates, updatedAt: nowIso() };
    persist();
  }

  function getPendingJobs(): ImportJob[] {
    const now = Date.now();
    return jobs.filter((job) => {
      if (job.status !== 'pending') return false;
      if (activeJobIds.has(job.id)) return false;
      if (job.nextRetryAt) {
        return Date.parse(job.nextRetryAt) <= now;
      }
      return true;
    });
  }

  async function processJob(job: ImportJob): Promise<void> {
    activeJobIds.add(job.id);
    activeCount += 1;

    updateJob(job.id, { status: 'processing' });
    emitEvent({ type: 'processing', job: { ...job, status: 'processing' } });

    try {
      const result = await executor(job);
      updateJob(job.id, {
        status: 'completed',
        resultEditionId: result.editionId,
        title: result.title ?? job.title
      });
      const updatedJob = jobs.find((j) => j.id === job.id)!;
      emitEvent({ type: 'completed', job: updatedJob });
    } catch (error) {
      const attempts = job.attempts + 1;
      const lastError = error instanceof Error ? error.message : String(error);

      if (attempts >= maxAttempts) {
        updateJob(job.id, { status: 'failed', attempts, lastError });
        const updatedJob = jobs.find((j) => j.id === job.id)!;
        emitEvent({ type: 'failed', job: updatedJob });
      } else {
        const nextRetryAt = new Date(Date.now() + computeBackoffMs(attempts)).toISOString();
        updateJob(job.id, { status: 'pending', attempts, lastError, nextRetryAt });
        // Schedule drain after backoff
        const delay = computeBackoffMs(attempts);
        setTimeout(() => drain(), delay);
      }
    } finally {
      activeJobIds.delete(job.id);
      activeCount -= 1;
      drain();
      flushIdleResolvers();
    }
  }

  function drain(): void {
    if (!running) return;

    const pending = getPendingJobs();
    while (activeCount < concurrency && pending.length > 0) {
      const job = pending.shift();
      if (!job) break;
      void processJob(job);
    }

    flushIdleResolvers();
  }

  function enqueue(input: string): ImportJob | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const source = classifyInput(trimmed);
    const canonicalKey = deriveCanonicalKey(trimmed, source);

    // Check in-queue duplicate
    const existing = jobs.find(
      (j) => j.canonicalKey === canonicalKey && (j.status === 'pending' || j.status === 'processing' || j.status === 'completed')
    );
    if (existing) {
      emitEvent({ type: 'duplicate', job: existing, existingId: existing.resultEditionId ?? existing.id });
      return null;
    }

    const job: ImportJob = {
      id: generateId(),
      source,
      input: trimmed,
      canonicalKey,
      status: 'pending',
      attempts: 0,
      maxAttempts: maxAttempts,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    jobs.push(job);
    persist();
    emitEvent({ type: 'enqueued', job });
    drain();
    return job;
  }

  function retry(jobId: string): void {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status !== 'failed') return;

    updateJob(jobId, { status: 'pending', attempts: 0, lastError: undefined, nextRetryAt: undefined });
    notify();
    drain();
  }

  function remove(jobId: string): void {
    jobs = jobs.filter((j) => j.id !== jobId);
    persist();
    notify();
  }

  function snapshot(): ImportQueueSnapshot {
    return {
      jobs: [...jobs],
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length
    };
  }

  function getJob(jobId: string): ImportJob | undefined {
    return jobs.find((j) => j.id === jobId);
  }

  function start(): void {
    running = true;
    drain();
  }

  function stop(): void {
    running = false;
  }

  function idle(): Promise<void> {
    if (activeCount === 0 && getPendingJobs().length === 0) return Promise.resolve();
    return new Promise((resolve) => idleResolvers.push(resolve));
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  return { enqueue, retry, remove, snapshot, getJob, start, stop, idle, subscribe };
}

/**
 * Default executor that handles both URL-based and ISBN-based imports.
 * This is wired up at runtime to avoid circular imports.
 */
async function defaultExecutor(job: ImportJob): Promise<{ editionId: string; title?: string }> {
  // Duplicate detection before doing network work
  if (job.source === 'isbn') {
    const dupCheck = await detectDuplicate({ isbn: job.input });
    if (dupCheck.isDuplicate) {
      return { editionId: dupCheck.existingId, title: job.title };
    }
  } else if (job.source === 'bookwyrm' || job.source === 'openlibrary' || job.source === 'google_books') {
    const dupCheck = await detectDuplicate({ uri: job.input });
    if (dupCheck.isDuplicate) {
      return { editionId: dupCheck.existingId, title: job.title };
    }
  }

  if (job.source === 'isbn') {
    const result = await resolveIsbn(job.input);
    if (!result) {
      throw new Error(`No book found for ISBN: ${job.input}`);
    }

    const graph = isbnResultToApGraph(result, job.input);

    // Lazy-load ingest to avoid circular dependency at module level
    const { ingestActivityPubGraph, getRxDBActivityPubStore } = await import('../db/activitypub-ingest');
    const store = await getRxDBActivityPubStore();
    await ingestActivityPubGraph(graph, store);

    return { editionId: graph.rootId, title: result.title };
  }

  // URL-based import (BookWyrm, OpenLibrary URL, Google Books URL)
  const { getRxDBActivityPubStore } = await import('../db/activitypub-ingest');
  const { ActivityPubResolver } = await import('../sync/resolver');
  const store = await getRxDBActivityPubStore();
  const resolver = new ActivityPubResolver(store);
  const result = await resolver.importEditionFromUrl(job.input);

  return { editionId: result.id, title: result.title };
}

// Singleton instance for app-wide use
let sharedQueue: ImportQueue | null = null;

export function getImportQueue(): ImportQueue {
  if (!sharedQueue) {
    sharedQueue = createImportQueue();
    sharedQueue.start();
  }
  return sharedQueue;
}
