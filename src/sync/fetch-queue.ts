type QueueTask<T> = {
  key: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class FetchQueue {
  private active = 0;
  private readonly queued: QueueTask<unknown>[] = [];
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly concurrency = 3) {}

  enqueue<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = new Promise<T>((resolve, reject) => {
      this.queued.push({ key, run, resolve: resolve as (value: unknown) => void, reject });
      this.drain();
    });
    this.inFlight.set(key, promise);
    promise.finally(() => this.inFlight.delete(key));
    return promise;
  }

  private drain() {
    while (this.active < this.concurrency && this.queued.length > 0) {
      const task = this.queued.shift()!;
      this.active += 1;
      task.run()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => { this.active -= 1; this.drain(); });
    }
  }
}
