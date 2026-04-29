import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, SearchVectorDoc, WorkDoc } from '../db/schema';
import { searchableText } from './embeddings';
import { getEmbeddingProvider } from './embedding-provider';
import { authorDocToSearchDocument } from './search-document-projection';
import { clearInMemoryVectorIndex, indexDocument } from './vector-index';
import type { SearchDocument } from './types';
import { hashText, vectorId } from './vector-utils';

const REINDEX_CONCURRENCY = 4;
const SEARCH_INDEX_BATCH_SIZE = 50;
const HEALTH_CHECK_STARTUP_DELAY_MS = 5_000;
const defaultDbKey = 'default';
const healthPromises = new Map<string, Promise<SearchIndexHealth>>();
const repairPromises = new Map<string, Promise<void>>();

export type SearchIndexHealth = {
  searchableDocuments: number;
  vectorsForCurrentProvider: number;
  vectorsForOtherProviders: number;
  missingVectors: number;
  staleVectors: number;
  invalidVectors: number;
  orphanVectors: number;
  healthy: boolean;
  checkedAt: string;
};

export type SearchIndexRepairOptions = {
  indexer?: (doc: SearchDocument, db: RyuDatabase) => Promise<void> | void;
};

type SearchVectorMetadata = Pick<SearchVectorDoc, 'id' | 'entityId' | 'entityType' | 'model' | 'textHash' | 'dimensions'>;
type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

type SearchableEntityType = SearchDocument['type'];
type AuthorNameCache = Map<string, string>;

async function getDatabase(db?: RyuDatabase): Promise<RyuDatabase> {
  return db ?? initializeDatabase();
}

function dbKey(db?: RyuDatabase): string {
  return db ? db.name : defaultDbKey;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function findCursorBatch<T extends { id: string }>(
  collection: { find: (query: unknown) => { exec: () => Promise<T[]> } },
  lastId: string
): Promise<T[]> {
  return collection.find({
    selector: lastId ? { id: { $gt: lastId } } : {},
    sort: [{ id: 'asc' }],
    limit: SEARCH_INDEX_BATCH_SIZE
  }).exec();
}

async function* iterateCollection<T extends { id: string }>(
  collection: { find: (query: unknown) => { exec: () => Promise<T[]> } }
): AsyncGenerator<T[]> {
  let lastId = '';
  while (true) {
    const batch = await findCursorBatch<T>(collection, lastId);
    if (batch.length === 0) return;
    yield batch;
    lastId = batch[batch.length - 1].id;
    if (batch.length < SEARCH_INDEX_BATCH_SIZE) return;
    await yieldToEventLoop();
  }
}

async function resolveAuthorNamesCached(db: RyuDatabase, authorIds: string[], cache: AuthorNameCache): Promise<string> {
  if (authorIds.length === 0) return '';
  const uniqueIds = [...new Set(authorIds)];

  for (const id of uniqueIds) {
    if (cache.has(id)) continue;
    const author = await db.authors.findOne(id).exec().catch(() => null);
    cache.set(id, author?.name || id);
  }

  return uniqueIds.map((id) => cache.get(id) || id).join(' ');
}

async function documentsForBatch(
  db: RyuDatabase,
  type: SearchableEntityType,
  batch: Array<AuthorDoc | WorkDoc | EditionDoc>,
  authorCache: AuthorNameCache
): Promise<SearchDocument[]> {
  const docs: SearchDocument[] = [];

  if (type === 'author') {
    for (const author of batch as AuthorDoc[]) docs.push(authorDocToSearchDocument(author));
    return docs;
  }

  if (type === 'work') {
    for (const work of batch as WorkDoc[]) {
      docs.push({
        id: work.id,
        type: 'work',
        title: work.title,
        description: work.summary || '',
        authorText: await resolveAuthorNamesCached(db, work.authorIds, authorCache),
        isbnText: '',
        enrichmentText: '',
        source: 'local',
        updatedAt: work.updatedAt
      });
    }
    return docs;
  }

  for (const edition of batch as EditionDoc[]) {
    docs.push({
      id: edition.id,
      type: 'edition',
      title: edition.title,
      description: edition.description || '',
      authorText: await resolveAuthorNamesCached(db, edition.authorIds, authorCache),
      isbnText: `${edition.isbn10 || ''} ${edition.isbn13 || ''}`.trim(),
      enrichmentText: edition.subtitle || '',
      source: 'local',
      updatedAt: edition.updatedAt
    });
  }

  return docs;
}

async function visitSearchableDocumentBatches(
  db: RyuDatabase,
  visitor: (docs: SearchDocument[]) => Promise<void> | void
): Promise<number> {
  let count = 0;
  const authorCache: AuthorNameCache = new Map();

  for await (const batch of iterateCollection<EditionDoc>(db.editions as never)) {
    const docs = await documentsForBatch(db, 'edition', batch, authorCache);
    await visitor(docs);
    count += docs.length;
  }

  for await (const batch of iterateCollection<WorkDoc>(db.works as never)) {
    const docs = await documentsForBatch(db, 'work', batch, authorCache);
    await visitor(docs);
    count += docs.length;
  }

  for await (const batch of iterateCollection<AuthorDoc>(db.authors as never)) {
    const docs = await documentsForBatch(db, 'author', batch, authorCache);
    await visitor(docs);
    count += docs.length;
  }

  return count;
}

async function collectSearchableEntityRefs(db: RyuDatabase): Promise<Set<string>> {
  const refs = new Set<string>();
  for await (const batch of iterateCollection<EditionDoc>(db.editions as never)) for (const edition of batch) refs.add(`edition:${edition.id}`);
  for await (const batch of iterateCollection<WorkDoc>(db.works as never)) for (const work of batch) refs.add(`work:${work.id}`);
  for await (const batch of iterateCollection<AuthorDoc>(db.authors as never)) for (const author of batch) refs.add(`author:${author.id}`);
  return refs;
}

function vectorEntityKey(vector: Pick<SearchVectorDoc, 'entityType' | 'entityId'>): string {
  return `${vector.entityType}:${vector.entityId}`;
}

async function findVectorsByIds(db: RyuDatabase, ids: string[]): Promise<SearchVectorMetadata[]> {
  if (ids.length === 0) return [];
  const rows = await db.searchvectors.find({ selector: { id: { $in: ids } } as never }).exec();
  return (rows as SearchVectorDoc[]).map(({ id, entityId, entityType, model, textHash, dimensions }) => ({ id, entityId, entityType, model, textHash, dimensions }));
}

async function defaultRepairIndexer(doc: SearchDocument): Promise<void> {
  await indexDocument(doc);
}

async function indexDocumentsWithLimit(db: RyuDatabase, docs: SearchDocument[], indexer: NonNullable<SearchIndexRepairOptions['indexer']>): Promise<void> {
  for (let offset = 0; offset < docs.length; offset += REINDEX_CONCURRENCY) {
    const batch = docs.slice(offset, offset + REINDEX_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((doc) => indexer(doc, db)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('Failed to repair search vector', {
          entityId: batch[index].id,
          entityType: batch[index].type,
          error: result.reason
        });
      }
    });
  }
}

function currentVectorId(doc: SearchDocument): string {
  const provider = getEmbeddingProvider();
  return vectorId(doc.id, provider.id, provider.dimensions);
}

function currentTextHash(doc: SearchDocument): string {
  return hashText(searchableText(doc));
}

export async function inspectSearchIndexHealth(db?: RyuDatabase): Promise<SearchIndexHealth> {
  const key = dbKey(db);
  const existing = healthPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const database = await getDatabase(db);
    const provider = getEmbeddingProvider();
    const entityRefs = new Set<string>();

    let searchableDocuments = 0;
    let missingVectors = 0;
    let staleVectors = 0;

    searchableDocuments = await visitSearchableDocumentBatches(database, async (docs) => {
      for (const doc of docs) entityRefs.add(`${doc.type}:${doc.id}`);
      const vectorIds = docs.map(currentVectorId);
      const vectors = await findVectorsByIds(database, vectorIds);
      const currentVectorById = new Map(vectors.filter((vector) => vector.model === provider.id && vector.dimensions === provider.dimensions).map((vector) => [vector.id, vector]));

      for (const doc of docs) {
        const vector = currentVectorById.get(currentVectorId(doc));
        if (!vector) {
          missingVectors += 1;
          continue;
        }
        if (vector.textHash !== currentTextHash(doc)) staleVectors += 1;
      }
    });

    let vectorsForCurrentProvider = 0;
    let vectorsForOtherProviders = 0;
    let invalidVectors = 0;
    let orphanVectors = 0;

    for await (const batch of iterateCollection<SearchVectorDoc>(database.searchvectors as never)) {
      for (const vector of batch) {
        if (vector.model === provider.id && vector.dimensions === provider.dimensions) vectorsForCurrentProvider += 1;
        else if (vector.model === provider.id) invalidVectors += 1;
        else vectorsForOtherProviders += 1;
        if (!entityRefs.has(vectorEntityKey(vector))) orphanVectors += 1;
      }
    }

    return {
      searchableDocuments,
      vectorsForCurrentProvider,
      vectorsForOtherProviders,
      missingVectors,
      staleVectors,
      invalidVectors,
      orphanVectors,
      healthy: missingVectors === 0 && staleVectors === 0 && invalidVectors === 0 && orphanVectors === 0,
      checkedAt: new Date().toISOString()
    };
  })().catch((error) => {
    console.error('Search index health check failed', { error });
    throw error;
  }).finally(() => {
    healthPromises.delete(key);
  });

  healthPromises.set(key, promise);
  return promise;
}

async function removeVectors(db: RyuDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const collection = db.searchvectors as unknown as {
    bulkRemove?: (ids: string[]) => Promise<unknown>;
    findOne: (id: string) => { exec: () => Promise<{ remove: () => Promise<unknown> } | null> };
  };
  if (typeof collection.bulkRemove === 'function') {
    await collection.bulkRemove(ids);
    return;
  }
  await Promise.all(ids.map(async (id) => {
    const row = await collection.findOne(id).exec();
    if (row) await row.remove();
  }));
}

async function removeInvalidAndOrphanVectors(db: RyuDatabase): Promise<void> {
  const provider = getEmbeddingProvider();
  const entityRefs = await collectSearchableEntityRefs(db);
  const removeIds: string[] = [];

  for await (const batch of iterateCollection<SearchVectorDoc>(db.searchvectors as never)) {
    for (const vector of batch) {
      if (vector.model === provider.id && vector.dimensions !== provider.dimensions) removeIds.push(vector.id);
      else if (!entityRefs.has(vectorEntityKey(vector))) removeIds.push(vector.id);
    }
  }

  for (let offset = 0; offset < removeIds.length; offset += SEARCH_INDEX_BATCH_SIZE) {
    await removeVectors(db, removeIds.slice(offset, offset + SEARCH_INDEX_BATCH_SIZE)).catch((error: unknown) => {
      console.error('Failed to remove invalid or orphan search vectors', { error });
    });
    await yieldToEventLoop();
  }
}

export async function repairSearchIndexHealth(db?: RyuDatabase, options: SearchIndexRepairOptions = {}): Promise<void> {
  const key = dbKey(db);
  const existing = repairPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const database = await getDatabase(db);
    const provider = getEmbeddingProvider();
    const indexer = options.indexer ?? defaultRepairIndexer;
    const pending: SearchDocument[] = [];

    clearInMemoryVectorIndex();

    await visitSearchableDocumentBatches(database, async (docs) => {
      const vectors = await findVectorsByIds(database, docs.map(currentVectorId));
      const currentVectorById = new Map(vectors.filter((vector) => vector.model === provider.id && vector.dimensions === provider.dimensions).map((vector) => [vector.id, vector]));

      for (const doc of docs) {
        const vector = currentVectorById.get(currentVectorId(doc));
        const needsRepair = !vector || vector.textHash !== currentTextHash(doc);
        if (!needsRepair) continue;
        pending.push(doc);
      }

      if (pending.length >= REINDEX_CONCURRENCY) {
        const batch = pending.splice(0, pending.length);
        await indexDocumentsWithLimit(database, batch, indexer);
      }
    });

    if (pending.length > 0) await indexDocumentsWithLimit(database, pending, indexer);
    await removeInvalidAndOrphanVectors(database);
  })().catch((error) => {
    console.error('Search index repair failed', { error });
    throw error;
  }).finally(() => {
    repairPromises.delete(key);
  });

  repairPromises.set(key, promise);
  return promise;
}

export async function healSearchIndexIfNeeded(db?: RyuDatabase): Promise<SearchIndexHealth> {
  const database = await getDatabase(db);
  const health = await inspectSearchIndexHealth(database);
  if (!health.healthy) {
    console.info('Search index health check scheduled repair', health);
    scheduleSearchIndexRepair(database);
  }
  return health;
}

export async function rebuildSearchVectorsForCurrentProvider(db?: RyuDatabase): Promise<void> {
  await repairSearchIndexHealth(db);
}

export function scheduleSearchIndexRepair(db?: RyuDatabase): void {
  const run = () => {
    repairSearchIndexHealth(db).catch((error) => {
      console.error('Scheduled search index repair failed', { error });
    });
  };
  if (typeof window === 'undefined') {
    run();
    return;
  }
  window.setTimeout(run, 0);
}

export function scheduleSearchVectorRebuild(): void {
  scheduleSearchIndexRepair();
}

export function scheduleSearchIndexHealthCheck(): void {
  const run = () => {
    healSearchIndexIfNeeded().catch((error) => {
      console.error('Scheduled search index health check failed', { error });
    });
  };
  if (typeof window === 'undefined') {
    run();
    return;
  }
  const browserWindow = window as WindowWithIdleCallback;
  window.setTimeout(() => {
    if (typeof browserWindow.requestIdleCallback === 'function') {
      browserWindow.requestIdleCallback(run, { timeout: HEALTH_CHECK_STARTUP_DELAY_MS });
      return;
    }
    run();
  }, HEALTH_CHECK_STARTUP_DELAY_MS);
}
