export class FetchQueue {
  private active = 0;
  private readonly queue: (() => Promise<void>)[] = [];

  constructor(private concurrency = 4) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.active--;
          this.next();
        }
      });
      this.next();
    });
  }

  private next() {
    if (this.active >= this.concurrency) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active++;
    job();
  }
}
