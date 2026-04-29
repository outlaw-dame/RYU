import type { RyuDatabase } from '../db/client';
import type { CanonicalApEntity } from '../sync/activitypub-client';
import { canonicalEntityToSearchDocument } from './search-document-projection';
import type { SearchDocument } from './types';
import { indexDocument } from './vector-index';

export type SearchIndexJob = {
  db: RyuDatabase;
  entity: CanonicalApEntity;
  timestamp: string;
};

export type SearchIndexQueueOptions = {
  concurrency?: number;
  maxSize?: number;
  indexer?: (doc: SearchDocument) => Promise<void>;
  logger?: Pick<Console, 'error' | 'warn'>;
};

export type SearchIndexQueue = {
  enqueue(db: RyuDatabase, entity: CanonicalApEntity, timestamp: string): void;
  pending(): number;
  active(): number;
  idle(): Promise<void>;
};

const DEFAULT_INDEX_QUEUE_CONCURRENCY = 2;
const DEFAULT_INDEX_QUEUE_MAX_SIZE = 500;

function jobKey(job: SearchIndexJob): string {
  return `${job.entity.kind}:${job.entity.id}`;
}

export function createSearchIndexQueue(options: SearchIndexQueueOptions = {}): SearchIndexQueue {
  const concurrency = options.concurrency ?? DEFAULT_INDEX_QUEUE_CONCURRENCY;
  const maxSize = options.maxSize ?? DEFAULT_INDEX_QUEUE_MAX_SIZE;
  const indexer = options.indexer ?? indexDocument;
  const logger = options.logger ?? console;
  const queue: SearchIndexJob[] = [];
  const idleResolvers: Array<() => void> = [];
  let activeJobs = 0;

  function flushIdleResolvers(): void {
    if (queue.length > 0 || activeJobs > 0) return;
    const resolvers = idleResolvers.splice(0, idleResolvers.length);
    for (const resolve of resolvers) resolve();
  }

  async function runIndexJob(job: SearchIndexJob): Promise<void> {
    const doc = await canonicalEntityToSearchDocument(job.db, job.entity, job.timestamp);
    if (!doc) return;

    await indexer(doc).catch((error) => {
      logger.error('Failed to index imported search document', {
        entityId: doc.id,
        entityType: doc.type,
        error
      });
    });
  }

  function drain(): void {
    while (activeJobs < concurrency && queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;

      activeJobs += 1;
      void runIndexJob(job)
        .finally(() => {
          activeJobs -= 1;
          drain();
          flushIdleResolvers();
        });
    }

    flushIdleResolvers();
  }

  function enqueue(db: RyuDatabase, entity: CanonicalApEntity, timestamp: string): void {
    if (entity.kind === 'review') return;

    const job: SearchIndexJob = { db, entity, timestamp };
    const key = jobKey(job);
    const existingIndex = queue.findIndex((candidate) => jobKey(candidate) === key);

    if (existingIndex >= 0) {
      queue.splice(existingIndex, 1);
    } else if (queue.length >= maxSize) {
      const dropped = queue.shift();
      if (dropped) {
        logger.warn('Search index queue reached capacity; dropping oldest pending job', {
          entityId: dropped.entity.id,
          entityType: dropped.entity.kind
        });
      }
    }

    queue.push(job);
    drain();
  }

  function idle(): Promise<void> {
    if (queue.length === 0 && activeJobs === 0) return Promise.resolve();
    return new Promise((resolve) => idleResolvers.push(resolve));
  }

  return {
    enqueue,
    pending: () => queue.length,
    active: () => activeJobs,
    idle
  };
}

export const importedSearchIndexQueue = createSearchIndexQueue();
