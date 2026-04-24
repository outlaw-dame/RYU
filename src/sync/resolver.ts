import { FetchQueue } from "./fetch-queue";

export class ActivityPubResolver {
  private readonly queue = new FetchQueue(3);

  async fetchJson(uri: string) {
    return this.queue.enqueue(uri, async () => {
      const response = await fetch(uri, { headers: { Accept: "application/activity+json, application/ld+json, application/json" } });
      if (!response.ok) throw new Error(`Failed to fetch ${uri}: ${response.status}`);
      return response.json() as Promise<unknown>;
    });
  }
}
