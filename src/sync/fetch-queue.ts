type InFlightMap = Map<string, Promise<unknown>>;

export class FetchQueue {
  private active = 0;
  private readonly queue: Array<() => Promise<void>> = [];
  private readonly inFlight: InFlightMap = new Map();

  constructor(private readonly concurrency = 4) {}

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.active--;
          this.inFlight.delete(key);
          this.next();
        }
      });

      this.inFlight.set(key, promise);
      this.next();
    });

    return promise;
  }

  private next(): void {
    if (this.active >= this.concurrency) return;

    const job = this.queue.shift();
    if (!job) return;

    this.active++;
    void job();
  }
}
