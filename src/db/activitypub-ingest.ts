import type { SearchDocument } from "../search/types";
import { indexDocument } from "../search/vector-index";
import type { CanonicalApEntity, CanonicalApGraph } from "../sync/activitypub-client";
import { initializeDatabase, type RyuDatabase } from "./client";
import { enrichKnowledgeEntity } from "./entity-enrichment";

export type ActivityPubEntityStore = {
  upsertAuthor(entity: Extract<CanonicalApEntity, { kind: "author" }>): Promise<void>;
  upsertWork(entity: Extract<CanonicalApEntity, { kind: "work" }>): Promise<void>;
  upsertEdition(entity: Extract<CanonicalApEntity, { kind: "edition" }>): Promise<void>;
  upsertReview(entity: Extract<CanonicalApEntity, { kind: "review" }>): Promise<void>;
};

type SearchIndexJob = {
  db: RyuDatabase;
  entity: CanonicalApEntity;
  timestamp: string;
};

const INDEX_QUEUE_CONCURRENCY = 2;
const INDEX_QUEUE_MAX_SIZE = 500;
const indexQueue: SearchIndexJob[] = [];
let activeIndexJobs = 0;

function nowIso(): string {
  return new Date().toISOString();
}

async function safeUpsert(collection: any, doc: any) {
  if (typeof collection.incrementalUpsert === "function") {
    await collection.incrementalUpsert(doc);
  } else {
    await collection.upsert(doc);
  }
}

async function writeEntityResolution(db: RyuDatabase, entity: CanonicalApEntity) {
  const timestamp = nowIso();
  await safeUpsert(db.entityresolutions, {
    id: entity.id,
    canonicalUri: entity.id,
    entityType: entity.kind,
    entityId: entity.id,
    resolvedAt: timestamp
  });
}

function toKnowledgeCandidate(entity: CanonicalApEntity) {
  switch (entity.kind) {
    case 'author':
      return { id: entity.id, kind: 'author' as const, label: entity.name };
    case 'work':
      return { id: entity.id, kind: 'work' as const, label: entity.title, authorLabels: entity.authorIds };
    case 'edition':
      return { id: entity.id, kind: 'edition' as const, label: entity.title, authorLabels: entity.authorIds };
    default:
      return null;
  }
}

async function resolveAuthorNames(db: RyuDatabase, authorIds: string[]): Promise<string> {
  if (authorIds.length === 0) return '';

  const uniqueIds = [...new Set(authorIds)];
  const names = await Promise.all(uniqueIds.map(async (id) => {
    const author = await db.authors.findOne(id).exec().catch(() => null);
    return author?.name || id;
  }));

  return names.join(' ');
}

async function toSearchDocument(db: RyuDatabase, entity: CanonicalApEntity, timestamp: string): Promise<SearchDocument | null> {
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

async function runIndexJob(job: SearchIndexJob): Promise<void> {
  const doc = await toSearchDocument(job.db, job.entity, job.timestamp);
  if (!doc) return;

  await indexDocument(doc).catch((error) => {
    console.error('Failed to index imported search document', {
      entityId: doc.id,
      entityType: doc.type,
      error
    });
  });
}

function drainIndexQueue(): void {
  while (activeIndexJobs < INDEX_QUEUE_CONCURRENCY && indexQueue.length > 0) {
    const job = indexQueue.shift();
    if (!job) continue;

    activeIndexJobs += 1;
    void runIndexJob(job)
      .finally(() => {
        activeIndexJobs -= 1;
        drainIndexQueue();
      });
  }
}

function enqueueSearchIndexForEntity(db: RyuDatabase, entity: CanonicalApEntity, timestamp: string): void {
  if (entity.kind === 'review') return;

  const job: SearchIndexJob = { db, entity, timestamp };
  const key = jobKey(job);
  const existingIndex = indexQueue.findIndex((candidate) => jobKey(candidate) === key);

  if (existingIndex >= 0) {
    indexQueue.splice(existingIndex, 1);
  } else if (indexQueue.length >= INDEX_QUEUE_MAX_SIZE) {
    const dropped = indexQueue.shift();
    if (dropped) {
      console.warn('Search index queue reached capacity; dropping oldest pending job', {
        entityId: dropped.entity.id,
        entityType: dropped.entity.kind
      });
    }
  }

  indexQueue.push(job);
  drainIndexQueue();
}

export function createRxDBActivityPubStore(db: RyuDatabase): ActivityPubEntityStore {
  return {
    async upsertAuthor(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.authors, {
        id: entity.id,
        name: entity.name,
        summary: entity.summary,
        url: entity.url,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
      enqueueSearchIndexForEntity(db, entity, timestamp);
      const candidate = toKnowledgeCandidate(entity);
      if (candidate) void enrichKnowledgeEntity(candidate);
    },
    async upsertWork(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.works, {
        id: entity.id,
        title: entity.title,
        summary: entity.summary,
        authorIds: entity.authorIds,
        url: entity.url,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
      enqueueSearchIndexForEntity(db, entity, timestamp);
      const candidate = toKnowledgeCandidate(entity);
      if (candidate) void enrichKnowledgeEntity(candidate);
    },
    async upsertEdition(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.editions, {
        id: entity.id,
        title: entity.title,
        subtitle: entity.subtitle,
        description: entity.description,
        authorIds: entity.authorIds,
        workId: entity.workId,
        coverUrl: entity.coverUrl,
        isbn10: entity.isbn10,
        isbn13: entity.isbn13,
        sourceUrl: entity.sourceUrl,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
      enqueueSearchIndexForEntity(db, entity, timestamp);
      const candidate = toKnowledgeCandidate(entity);
      if (candidate) void enrichKnowledgeEntity(candidate);
    },
    async upsertReview(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.reviews, {
        id: entity.id,
        title: entity.title,
        content: entity.content,
        editionId: entity.editionId,
        accountId: entity.accountId,
        rating: entity.rating,
        published: entity.published,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
    }
  };
}

export async function getRxDBActivityPubStore(): Promise<ActivityPubEntityStore> {
  const db = await initializeDatabase();
  return createRxDBActivityPubStore(db);
}

export async function ingestActivityPubGraph(graph: CanonicalApGraph, store: ActivityPubEntityStore): Promise<void> {
  const entities = topoSortForRelations(graph.entities);

  for (const entity of entities) {
    switch (entity.kind) {
      case "author":
        await store.upsertAuthor(entity);
        break;
      case "work":
        await store.upsertWork(entity);
        break;
      case "edition":
        await store.upsertEdition(entity);
        break;
      case "review":
        await store.upsertReview(entity);
        break;
    }
  }
}

function topoSortForRelations(entities: CanonicalApEntity[]): CanonicalApEntity[] {
  const rank = {
    author: 0,
    work: 1,
    edition: 2,
    review: 3
  } as const;

  return [...entities].sort((a, b) => rank[a.kind] - rank[b.kind]);
}
