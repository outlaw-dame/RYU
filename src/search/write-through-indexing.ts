import type { RyuDatabase } from '../db/client';
import type { CanonicalApEntity } from '../sync/activitypub-client';
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
};

const DEFAULT_INDEX_QUEUE_CONCURRENCY = 2;
const DEFAULT_INDEX_QUEUE_MAX_SIZE = 500;

export async function resolveAuthorNames(db: RyuDatabase, authorIds: string[]): Promise<string> {
  if (authorIds.length === 0) return '';

  const uniqueIds = [...new Set(authorIds)];
  const names = await Promise.all(uniqueIds.map(async (id) => {
    const author = await db.authors.findOne(id).exec().catch(() => null);
    return author?.name || id;
  }));

  return names.join(' ');
}

export async function toSearchDocument(db: RyuDatabase, entity: CanonicalApEntity, timestamp: string): Promise<SearchDocument | null> {
  switch (entity.kind) {
    case 'author':
      return {
        id: entity.id,
        type: 'author',
        title: entity.name,
        description: entity.summary || '',
        authorText: entity.name,
        isbnText: '',
        enrichmentText: '',
        source: 'local',
        updatedAt: timestamp
      };
    case 'work':
      return {
        id: entity.id,
        type: 'work',
        title: entity.title,
        description: entity.summary || '',
        authorText: await resolveAuthorNames(db, entity.authorIds),
        isbnText: '',
        enrichmentText: '',
        source: 'local',
        updatedAt: timestamp
      };
    case 'edition':
      return {
        id: entity.id,
        type: 'edition',
        title: entity.title,
        description: entity.description || '',
        authorText: await resolveAuthorNames(db, entity.authorIds),
        isbnText: `${entity.isbn10 || ''} ${entity.isbn13 || ''}`.trim(),
        enrichmentText: entity.subtitle || '',
        source: 'local',
        updatedAt: timestamp
      };
    default:
      return null;
  }
}

function jobKey(job: SearchIndexJob): string {
  return `${job.entity.kind}:${job.entity.id}`;
}

export function createSearchIndexQueue(options: SearchIndexQueueOptions = {}): SearchIndexQueue {
  const concurrency = options.concurrency ?? DEFAULT_INDEX_QUEUE_CONCURRENCY;
  const maxSize = options.maxSize ?? DEFAULT_INDEX_QUEUE_MAX_SIZE;
  const indexer = options.indexer ?? indexDocument;
  const logger = options.logger ?? console;
  const queue: SearchIndexJob[] = [];
  let activeJobs = 0;

  async function runIndexJob(job: SearchIndexJob): Promise<void> {
    const doc = await toSearchDocument(job.db, job.entity, job.timestamp);
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
        });
    }
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

  return {
    enqueue,
    pending: () => queue.length,
    active: () => activeJobs
  };
}

export const importedSearchIndexQueue = createSearchIndexQueue();
