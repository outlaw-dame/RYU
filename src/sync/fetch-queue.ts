type QueueTask<T> = {
  key: string;
  host?: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export type FetchQueueOptions = {
  concurrency?: number;
  perHostConcurrency?: number;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  backoffMultiplier?: number;
  jitterMs?: number;
};

export type FetchRunOptions = {
  host?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  backoffMultiplier?: number;
  jitterMs?: number;
};

type ResolvedFetchRunOptions = {
  host?: string;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
};

const defaultOptions = {
  concurrency: 4,
  perHostConcurrency: 2,
  timeoutMs: 8_000,
  retries: 2,
  retryDelayMs: 400,
  backoffMultiplier: 2,
  jitterMs: 150
} satisfies Required<FetchQueueOptions>;

export class FetchQueue {
  private active = 0;
  private readonly queued: QueueTask<unknown>[] = [];
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly activeByHost = new Map<string, number>();
  private readonly options: Required<FetchQueueOptions>;

  constructor(options: FetchQueueOptions | number = {}) {
    this.options = typeof options === "number"
      ? { ...defaultOptions, concurrency: options }
      : { ...defaultOptions, ...options };
  }

  enqueue<T>(key: string, run: (signal: AbortSignal) => Promise<T>, options: FetchRunOptions = {}): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const taskOptions = { ...this.options, ...options };
    const promise = new Promise<T>((resolve, reject) => {
      this.queued.push({
        key,
        host: options.host,
        run: () => this.runWithRetries(run, taskOptions),
        resolve: resolve as (value: unknown) => void,
        reject
      });
      this.drain();
    });

    this.inFlight.set(key, promise);
    promise.finally(() => this.inFlight.delete(key));
    return promise;
  }

  run<T>(key: string, run: (signal: AbortSignal) => Promise<T>, options: FetchRunOptions = {}): Promise<T> {
    return this.enqueue(key, run, options);
  }

  private drain() {
    while (this.active < this.options.concurrency) {
      const taskIndex = this.queued.findIndex((task) => this.hasHostCapacity(task.host));
      if (taskIndex === -1) return;

      const [task] = this.queued.splice(taskIndex, 1);
      this.active += 1;
      if (task.host) this.reserveHost(task.host);

      Promise.resolve()
        .then(() => task.run())
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active -= 1;
          if (task.host) this.releaseHost(task.host);
          this.drain();
        });
    }
  }

  private async runWithRetries<T>(run: (signal: AbortSignal) => Promise<T>, options: ResolvedFetchRunOptions): Promise<T> {
    let delayMs = options.retryDelayMs;

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), options.timeoutMs);

      try {
        return await run(controller.signal);
      } catch (error) {
        if (attempt >= options.retries || !isRetryableError(error)) {
          throw error;
        }

        const jitter = Math.floor(Math.random() * options.jitterMs);
        await wait(delayMs + jitter);
        delayMs *= options.backoffMultiplier;
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
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof TypeError) return true;
  if (error instanceof Error && "retryable" in error) {
    return Boolean((error as { retryable?: boolean }).retryable);
  }
  return false;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}
