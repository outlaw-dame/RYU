/**
 * Phase 30: Core sync queue engine.
 *
 * Provides persistent queue processing with:
 * - Exponential backoff with jitter
 * - Deduplication by operation + entityId
 * - Configurable max attempts
 * - Drain/pause/resume/idle semantics
 * - Structured error reporting
 */

import type {
  QueueEngineOptions,
  QueueEntry,
  QueueError,
  QueueEvent,
  QueueExecutor,
  QueueHealth,
  QueueStatus,
} from './types';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_STORAGE_PREFIX = 'ryu:sync-queue';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Compute exponential backoff with jitter.
 */
export function computeBackoffMs(
  attempts: number,
  baseMs = DEFAULT_BASE_BACKOFF_MS,
  maxMs = DEFAULT_MAX_BACKOFF_MS
): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempts);
  const jitter = Math.floor(Math.random() * Math.min(1000, exponential * 0.25));
  return exponential + jitter;
}

/**
 * Derive a deduplication key from operation + entityId.
 */
export function deriveDedupeKey(operation: string, entityId: string): string {
  return `${operation}::${entityId}`;
}

export type SyncQueueEngine = {
  /** Enqueue a new operation. Returns the entry or null if deduplicated. */
  enqueue(params: {
    operation: string;
    entityType: string;
    entityId: string;
    payload: string;
  }): QueueEntry | null;
  /** Start processing the queue. */
  start(): void;
  /** Pause processing (current in-flight entries will complete). */
  pause(): void;
  /** Resume after pause. */
  resume(): void;
  /** Wait until no entries are being processed and no pending entries remain. */
  idle(): Promise<void>;
  /** Get the current health snapshot. */
  health(): QueueHealth;
  /** Get all entries with an optional status filter. */
  entries(status?: QueueStatus): QueueEntry[];
  /** Retry a specific failed entry. */
  retry(entryId: string): void;
  /** Remove a specific entry from the queue. */
  remove(entryId: string): void;
  /** Mark an entry as failed externally. */
  markFailed(entryId: string, error: QueueError): void;
  /** Subscribe to queue events (returns unsubscribe function). */
  subscribe(listener: () => void): () => void;
  /** Subscribe to granular events. */
  onEvent(listener: (event: QueueEvent) => void): () => void;
  /** Get a specific entry by id. */
  getEntry(entryId: string): QueueEntry | undefined;
  /** Force drain (useful after crash recovery resets entries). */
  drain(): void;
  /** Check if a dedupeKey already exists for a pending/processing entry. */
  hasPending(operation: string, entityId: string): boolean;
};

export function createSyncQueueEngine(options: QueueEngineOptions = {}): SyncQueueEngine {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const storagePrefix = options.storagePrefix ?? DEFAULT_STORAGE_PREFIX;
  const executor = options.executor ?? defaultExecutor;
  const logger = options.logger ?? console;

  let entries: QueueEntry[] = loadEntries();
  let cachedHealth: QueueHealth | null = null;
  let running = false;
  let activeCount = 0;
  const activeIds = new Set<string>();
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: QueueEvent) => void>();
  const idleResolvers: Array<() => void> = [];

  function loadEntries(): QueueEntry[] {
    try {
      const raw = localStorage.getItem(storagePrefix);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as QueueEntry[];
    } catch {
      return [];
    }
  }

  function persist(): void {
    cachedHealth = null;
    try {
      localStorage.setItem(storagePrefix, JSON.stringify(entries));
    } catch {
      // Storage full or unavailable - queue continues in-memory
    }
  }

  function notify(): void {
    for (const listener of listeners) {
      try { listener(); } catch { /* ignore */ }
    }
  }

  function emitEvent(event: QueueEvent): void {
    for (const listener of eventListeners) {
      try { listener(event); } catch { /* ignore */ }
    }
    notify();
  }

  function flushIdle(): void {
    if (activeCount > 0 || getPendingEntries().length > 0) return;
    const resolvers = idleResolvers.splice(0, idleResolvers.length);
    for (const r of resolvers) r();
  }

  function getPendingEntries(): QueueEntry[] {
    const now = Date.now();
    return entries.filter((e) => {
      if (e.status !== 'pending') return false;
      if (activeIds.has(e.id)) return false;
      if (e.nextRetryAt && Date.parse(e.nextRetryAt) > now) return false;
      return true;
    });
  }

  function updateEntry(id: string, updates: Partial<QueueEntry>): void {
    const index = entries.findIndex((e) => e.id === id);
    if (index < 0) return;
    entries[index] = { ...entries[index], ...updates, updatedAt: nowIso() };
    persist();
  }

  function getHealth(): QueueHealth {
    if (cachedHealth) return cachedHealth;
    const pending = entries.filter((e) => e.status === 'pending').length;
    const processing = entries.filter((e) => e.status === 'processing').length;
    const completed = entries.filter((e) => e.status === 'completed').length;
    const failed = entries.filter((e) => e.status === 'failed').length;

    const failedEntries = entries.filter((e) => e.status === 'failed' && e.error);
    const lastError = failedEntries.length > 0
      ? failedEntries.sort((a, b) =>
          (b.error?.timestamp ?? '').localeCompare(a.error?.timestamp ?? '')
        )[0].error ?? null
      : null;

    const completedEntries = entries.filter((e) => e.status === 'completed');
    const lastSuccessAt = completedEntries.length > 0
      ? completedEntries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].updatedAt
      : null;

    const allSorted = [...entries].sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
    const oldestEntryAt = allSorted.length > 0 ? allSorted[0].enqueuedAt : null;

    const lastErrorAt = lastError?.timestamp ?? null;

    cachedHealth = { pending, processing, completed, failed, oldestEntryAt, lastErrorAt, lastSuccessAt, lastError };
    return cachedHealth;
  }

  async function processEntry(entry: QueueEntry): Promise<void> {
    activeIds.add(entry.id);
    activeCount += 1;

    updateEntry(entry.id, { status: 'processing', claimedAt: nowIso() });
    emitEvent({ type: 'processing', entry: { ...entry, status: 'processing' } });

    try {
      await executor(entry);

      const exists = entries.some((e) => e.id === entry.id);
      if (!exists) return;

      updateEntry(entry.id, { status: 'completed', error: undefined });
      const updated = entries.find((e) => e.id === entry.id);
      if (updated) emitEvent({ type: 'completed', entry: updated });
    } catch (err) {
      const exists = entries.some((e) => e.id === entry.id);
      if (!exists) return;

      const attempts = entry.attempts + 1;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const queueError: QueueError = {
        message: errorMsg,
        stage: 'processing',
        recoverable: attempts < maxAttempts,
        timestamp: nowIso(),
      };

      if (attempts >= maxAttempts) {
        updateEntry(entry.id, { status: 'failed', attempts, error: queueError });
        const updated = entries.find((e) => e.id === entry.id);
        if (updated) emitEvent({ type: 'failed', entry: updated });
      } else {
        const backoff = computeBackoffMs(attempts, baseBackoffMs, maxBackoffMs);
        const nextRetryAt = new Date(Date.now() + backoff).toISOString();
        updateEntry(entry.id, { status: 'pending', attempts, error: queueError, nextRetryAt });
        setTimeout(() => drain(), backoff);
      }
    } finally {
      activeIds.delete(entry.id);
      activeCount -= 1;
      drain();
      flushIdle();
    }
  }

  function drain(): void {
    if (!running) return;

    const pending = getPendingEntries();
    while (activeCount < concurrency && pending.length > 0) {
      const entry = pending.shift();
      if (!entry) break;
      void processEntry(entry);
    }

    flushIdle();
  }

  function enqueue(params: {
    operation: string;
    entityType: string;
    entityId: string;
    payload: string;
  }): QueueEntry | null {
    const dedupeKey = deriveDedupeKey(params.operation, params.entityId);

    // Deduplication: reject if a pending or processing entry with same key exists
    const existing = entries.find(
      (e) => e.dedupeKey === dedupeKey && (e.status === 'pending' || e.status === 'processing')
    );
    if (existing) {
      emitEvent({ type: 'deduplicated', entry: existing, existingId: existing.id });
      return null;
    }

    const now = nowIso();
    const entry: QueueEntry = {
      id: generateId(),
      operation: params.operation,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: params.payload,
      status: 'pending',
      attempts: 0,
      maxAttempts,
      enqueuedAt: now,
      updatedAt: now,
      dedupeKey,
    };

    entries.push(entry);
    persist();
    emitEvent({ type: 'enqueued', entry });
    drain();
    return entry;
  }

  function start(): void {
    running = true;
    drain();
  }

  function pause(): void {
    running = false;
  }

  function resume(): void {
    running = true;
    drain();
  }

  function idle(): Promise<void> {
    if (activeCount === 0 && getPendingEntries().length === 0) return Promise.resolve();
    return new Promise((resolve) => idleResolvers.push(resolve));
  }

  function retryEntry(entryId: string): void {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.status !== 'failed') return;
    updateEntry(entryId, {
      status: 'pending',
      attempts: 0,
      error: undefined,
      nextRetryAt: undefined,
    });
    notify();
    drain();
  }

  function removeEntry(entryId: string): void {
    entries = entries.filter((e) => e.id !== entryId);
    persist();
    notify();
  }

  function markFailed(entryId: string, error: QueueError): void {
    updateEntry(entryId, { status: 'failed', error });
    const entry = entries.find((e) => e.id === entryId);
    if (entry) emitEvent({ type: 'failed', entry });
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function onEventFn(listener: (event: QueueEvent) => void): () => void {
    eventListeners.add(listener);
    return () => { eventListeners.delete(listener); };
  }

  function getEntry(entryId: string): QueueEntry | undefined {
    return entries.find((e) => e.id === entryId);
  }

  function hasPending(operation: string, entityId: string): boolean {
    const key = deriveDedupeKey(operation, entityId);
    return entries.some(
      (e) => e.dedupeKey === key && (e.status === 'pending' || e.status === 'processing')
    );
  }

  function getEntries(status?: QueueStatus): QueueEntry[] {
    if (!status) return [...entries];
    return entries.filter((e) => e.status === status);
  }

  // Cross-tab synchronization: listen for storage changes from other tabs
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === storagePrefix) {
        entries = loadEntries();
        cachedHealth = null;
        notify();
        drain();
      }
    });
  }

  return {
    enqueue,
    start,
    pause,
    resume,
    idle,
    health: getHealth,
    entries: getEntries,
    retry: retryEntry,
    remove: removeEntry,
    markFailed,
    subscribe,
    onEvent: onEventFn,
    getEntry,
    drain,
    hasPending,
  };
}

/** Default no-op executor. Real executors are injected at wire-up time. */
async function defaultExecutor(_entry: QueueEntry): Promise<void> {
  // No-op: consumers must provide a real executor
}
