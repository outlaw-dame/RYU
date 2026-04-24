import { initializeDatabase } from './client';
import type { QueueStatus } from './schema';

export type FetchQueueStatusEvent = {
  id: string;
  url: string;
  host: string;
  status: QueueStatus;
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  error?: string;
};

export async function persistFetchQueueStatus(event: FetchQueueStatusEvent): Promise<void> {
  try {
    const db = await initializeDatabase();
    const doc = {
      id: event.id,
      url: event.url,
      host: event.host,
      status: event.status,
      attempts: event.attempts,
      lastAttemptAt: event.lastAttemptAt,
      nextAttemptAt: event.nextAttemptAt,
      error: event.error
    };

    if (typeof db.fetchqueue.incrementalUpsert === 'function') {
      await db.fetchqueue.incrementalUpsert(doc);
      return;
    }

    await db.fetchqueue.upsert(doc);
  } catch {
    // Queue persistence must never make network fetches fail. The queue itself
    // remains authoritative in memory for the current session; this hook only
    // provides reload recovery and observability when storage is available.
  }
}
