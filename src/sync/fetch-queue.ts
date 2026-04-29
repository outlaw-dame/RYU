import type { FetchQueueStatusEvent } from '../db/fetch-queue-persistence';

type InFlightMap = Map<string, Promise<unknown>>;
type FetchQueuePersistenceModule = typeof import('../db/fetch-queue-persistence');

export interface FetchQueueOptions {
  concurrency?: number;
  perHostConcurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
  jitterMs?: number;
  retryAfterCapMs?: number;
  persistStatus?: boolean;
}

export interface FetchRunOptions {
  host?: string;
  retries?: number;
  retryDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
  jitterMs?: number;
  retryAfterCapMs?: number;
  persistStatus?: boolean;
}

type QueueEntry = {
  key: string;
  host?: string;
  run: () => Promise<void>;
};

const defaultOptions: Required<FetchQueueOptions> = {
  concurrency: 4,
  perHostConcurrency: 2,
  retries: 2,
  retryDelayMs: 400,
  backoffMultiplier: 2,
  timeoutMs: 10_000,
  jitterMs: 150,
  retryAfterCapMs: 10_000,
  persistStatus: true
};

let persistenceModulePromise: Promise<FetchQueuePersistenceModule> | null = null;

export class FetchQueue {
  private active = 0;
  private readonly queue: QueueEntry[] = [];
  private readonly inFlight: InFlightMap = new Map();
  private readonly activeByHost = new Map<string, number>();
  private readonly options: Required<FetchQueueOptions>;

  constructor(options: FetchQueueOptions = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  run<T>(key: string, task: (signal: AbortSignal) => Promise<T>, options: FetchRunOptions = {}): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
    let rejectPromise: (reason?: unknown) => void = () => undefined;

    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this.inFlight.set(key, promise);

    const host = options.host ?? 'unknown';

    this.persistStatus({
      id: key,
      url: key,
      host,
      status: 'pending',
      attempts: 0
    }, options);

    this.queue.push({
      key,
      host,
      run: async () => {
        try {
          const result = await this.executeWithRetry(key, task, options);

          this.persistStatus({
            id: key,
            url: key,
            host,
            status: 'completed',
            attempts: 1
          }, options);

          resolvePromise(result);
        } catch (error) {
          this.persistStatus({
            id: key,
            url: key,
            host,
            status: 'failed',
            attempts: 1,
            error: error instanceof Error ? error.message : String(error)
          }, options);

          rejectPromise(error);
        } finally {
          this.active--;
          if (host) {
            this.releaseHost(host);
          }
          this.inFlight.delete(key);
          this.next();
        }
      }
    });
    this.next();
    return promise;
  }

  private next(): void {
    while (this.active < this.options.concurrency) {
      const nextIndex = this.queue.findIndex((entry) => this.hasHostCapacity(entry.host));
      if (nextIndex === -1) return;

      const [job] = this.queue.splice(nextIndex, 1);
      this.active++;
      if (job.host) {
        this.reserveHost(job.host);
      }
      void job.run();
    }
  }

  private async executeWithRetry<T>(key: string, task: (signal: AbortSignal) => Promise<T>, options: FetchRunOptions): Promise<T> {
    const retries = options.retries ?? this.options.retries;
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    const backoffMultiplier = options.backoffMultiplier ?? this.options.backoffMultiplier;
    let delayMs = options.retryDelayMs ?? this.options.retryDelayMs;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

      try {
        this.persistStatus({
          id: key,
          url: key,
          host: options.host ?? 'unknown',
          status: 'processing',
          attempts: attempt + 1,
          lastAttemptAt: new Date().toISOString()
        }, options);

        return await task(controller.signal);
      } catch (error) {
        const shouldRetry = attempt < retries && isRetryableError(error);
        if (!shouldRetry) throw error;

        const retryAfterMs = getRetryAfterMs(error, options.retryAfterCapMs ?? this.options.retryAfterCapMs);
        const jitterMs = options.jitterMs ?? this.options.jitterMs;
        const jitter = retryAfterMs == null ? Math.floor(Math.random() * jitterMs) : 0;
        const waitMs = retryAfterMs ?? delayMs + jitter;
        const nextAttemptAt = new Date(Date.now() + waitMs).toISOString();

        this.persistStatus({
          id: key,
          url: key,
          host: options.host ?? 'unknown',
          status: 'pending',
          attempts: attempt + 1,
          lastAttemptAt: new Date().toISOString(),
          nextAttemptAt
        }, options);

        await wait(waitMs);
        delayMs *= backoffMultiplier;
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
    }
  }

  private hasHostCapacity(host?: string): boolean {
    if (!host) return true;
    return (this.activeByHost.get(host) ?? 0) < this.options.perHostConcurrency;
  }

  private reserveHost(host: string): void {
    this.activeByHost.set(host, (this.activeByHost.get(host) ?? 0) + 1);
  }

  private releaseHost(host: string): void {
    const nextCount = (this.activeByHost.get(host) ?? 1) - 1;
    if (nextCount <= 0) {
      this.activeByHost.delete(host);
      return;
    }

    this.activeByHost.set(host, nextCount);
  }

  private persistStatus(event: FetchQueueStatusEvent, options: FetchRunOptions = {}): void {
    if (!(options.persistStatus ?? this.options.persistStatus)) return;
    void persistFetchQueueStatusSafely(event);
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error && 'retryable' in error) {
    return Boolean((error as { retryable?: boolean }).retryable);
  }

  return false;
}

function getRetryAfterMs(error: unknown, capMs: number): number | null {
  if (!(error instanceof Error) || !('retryAfterMs' in error)) {
    return null;
  }

  const retryAfterMs = Number((error as { retryAfterMs?: unknown }).retryAfterMs);
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
    return null;
  }

  return Math.min(retryAfterMs, capMs);
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

async function persistFetchQueueStatusSafely(event: FetchQueueStatusEvent): Promise<void> {
  try {
    const module = await loadFetchQueuePersistence();
    await module.persistFetchQueueStatus(event);
  } catch {
    // Queue persistence is optional observability. Network work must remain
    // usable in runtimes where IndexedDB-backed RxDB is unavailable.
  }
}

function loadFetchQueuePersistence(): Promise<FetchQueuePersistenceModule> {
  if (!persistenceModulePromise) {
    persistenceModulePromise = import('../db/fetch-queue-persistence').catch((error: unknown) => {
      persistenceModulePromise = null;
      throw error;
    });
  }

  return persistenceModulePromise;
}
