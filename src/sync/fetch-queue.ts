type InFlightMap = Map<string, Promise<unknown>>;

export interface FetchQueueOptions {
  concurrency?: number;
  perHostConcurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
  jitterMs?: number;
}

export interface FetchRunOptions {
  host?: string;
  retries?: number;
  retryDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
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
  jitterMs: 150
};

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
    this.queue.push({
      key,
      host: options.host,
      run: async () => {
        try {
          const result = await this.executeWithRetry(task, options);
          resolvePromise(result);
        } catch (error) {
          rejectPromise(error);
        } finally {
          this.active--;
          if (options.host) {
            this.releaseHost(options.host);
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

  private async executeWithRetry<T>(task: (signal: AbortSignal) => Promise<T>, options: FetchRunOptions): Promise<T> {
    const retries = options.retries ?? this.options.retries;
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    const backoffMultiplier = options.backoffMultiplier ?? this.options.backoffMultiplier;
    let delayMs = options.retryDelayMs ?? this.options.retryDelayMs;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await task(controller.signal);
      } catch (error) {
        const shouldRetry = attempt < retries && isRetryableError(error);
        if (!shouldRetry) throw error;

        const jitter = Math.floor(Math.random() * this.options.jitterMs);
        await wait(delayMs + jitter);
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
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error && 'retryable' in error) {
    return Boolean((error as { retryable?: boolean }).retryable);
  }

  return true;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}
