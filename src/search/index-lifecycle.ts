import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, SearchVectorDoc, WorkDoc } from '../db/schema';
import { searchableText } from './embeddings';
import { getEmbeddingProvider } from './embedding-provider';
import { authorDocToSearchDocument } from './search-document-projection';
import type { SearchDocument } from './types';
import { clearInMemoryVectorIndex, indexDocument } from './vector-index';
import { hashText, vectorId } from './vector-utils';

const REINDEX_CONCURRENCY = 4;
const SEARCH_INDEX_BATCH_SIZE = 50;
const HEALTH_CHECK_STARTUP_DELAY_MS = 5_000;
const DEFAULT_DB_KEY = 'default';
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

type Row = { id: string };
type Collection<T extends Row> = { find: (query: unknown) => { exec: () => Promise<T[]> } };
type VectorMeta = Pick<SearchVectorDoc, 'id' | 'entityId' | 'entityType' | 'model' | 'textHash' | 'dimensions'>;
type AuthorCache = Map<string, string>;
type WindowWithIdleCallback = Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number };

async function getDatabase(db?: RyuDatabase): Promise<RyuDatabase> {
  return db ?? initializeDatabase();
}

function dbKey(db?: RyuDatabase): string {
  return db?.name ?? DEFAULT_DB_KEY;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function* iterate<T extends Row>(collection: Collection<T>): AsyncGenerator<T[]> {
  let lastId = '';
  while (true) {
    const batch = await collection.find({
      selector: lastId ? { id: { $gt: lastId } } : {},
      sort: [{ id: 'asc' }],
      limit: SEARCH_INDEX_BATCH_SIZE
    }).exec();
    if (batch.length === 0) return;
    yield batch;
    lastId = batch[batch.length - 1].id;
    if (batch.length < SEARCH_INDEX_BATCH_SIZE) return;
    await tick();
  }
}

async function authorNames(db: RyuDatabase, ids: string[], cache: AuthorCache): Promise<string> {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (cache.has(id)) continue;
    const author = await db.authors.findOne(id).exec().catch(() => null);
    cache.set(id, author?.name || id);
  }
  return unique.map((id) => cache.get(id) || id).join(' ');
}

async function docsForEditions(db: RyuDatabase, rows: EditionDoc[], cache: AuthorCache): Promise<SearchDocument[]> {
  const docs: SearchDocument[] = [];
  for (const edition of rows) {
    docs.push({
      id: edition.id,
      type: 'edition',
      title: edition.title,
      description: edition.description || '',
      authorText: await authorNames(db, edition.authorIds, cache),
      isbnText: `${edition.isbn10 || ''} ${edition.isbn13 || ''}`.trim(),
      enrichmentText: edition.subtitle || '',
      source: 'local',
      updatedAt: edition.updatedAt
    });
  }
  return docs;
}

async function docsForWorks(db: RyuDatabase, rows: WorkDoc[], cache: AuthorCache): Promise<SearchDocument[]> {
  const docs: SearchDocument[] = [];
  for (const work of rows) {
    docs.push({
      id: work.id,
      type: 'work',
      title: work.title,
      description: work.summary || '',
      authorText: await authorNames(db, work.authorIds, cache),
      isbnText: '',
      enrichmentText: '',
      source: 'local',
      updatedAt: work.updatedAt
    });
  }
  return docs;
}

async function visitDocumentBatches(db: RyuDatabase, visitor: (docs: SearchDocument[]) => Promise<void> | void): Promise<number> {
  let total = 0;
  const cache: AuthorCache = new Map();

  for await (const batch of iterate<EditionDoc>(db.editions as never)) {
    const docs = await docsForEditions(db, batch, cache);
    await visitor(docs);
    total += docs.length;
  }
  for await (const batch of iterate<WorkDoc>(db.works as never)) {
    const docs = await docsForWorks(db, batch, cache);
    await visitor(docs);
    total += docs.length;
  }
  for await (const batch of iterate<AuthorDoc>(db.authors as never)) {
    const docs = batch.map(authorDocToSearchDocument);
    await visitor(docs);
    total += docs.length;
  }

  return total;
}

async function entityRefs(db: RyuDatabase): Promise<Set<string>> {
  const refs = new Set<string>();
  for await (const batch of iterate<EditionDoc>(db.editions as never)) for (const row of batch) refs.add(`edition:${row.id}`);
  for await (const batch of iterate<WorkDoc>(db.works as never)) for (const row of batch) refs.add(`work:${row.id}`);
  for await (const batch of iterate<AuthorDoc>(db.authors as never)) for (const row of batch) refs.add(`author:${row.id}`);
  return refs;
}

function entityKey(vector: Pick<SearchVectorDoc, 'entityType' | 'entityId'>): string {
  return `${vector.entityType}:${vector.entityId}`;
}

async function vectorsByIds(db: RyuDatabase, ids: string[]): Promise<VectorMeta[]> {
  if (ids.length === 0) return [];
  const rows = await db.searchvectors.find({ selector: { id: { $in: ids } } as never }).exec();
  return (rows as SearchVectorDoc[]).map(({ id, entityId, entityType, model, textHash, dimensions }) => ({ id, entityId, entityType, model, textHash, dimensions }));
}

function currentVectorId(doc: SearchDocument): string {
  const provider = getEmbeddingProvider();
  return vectorId(doc.id, provider.id, provider.dimensions);
}

function currentTextHash(doc: SearchDocument): string {
  return hashText(searchableText(doc));
}

async function defaultRepairIndexer(doc: SearchDocument, db: RyuDatabase): Promise<void> {
  await indexDocument(doc, db);
}

async function indexBatch(db: RyuDatabase, docs: SearchDocument[], indexer: NonNullable<SearchIndexRepairOptions['indexer']>): Promise<void> {
  for (let offset = 0; offset < docs.length; offset += REINDEX_CONCURRENCY) {
    const batch = docs.slice(offset, offset + REINDEX_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((doc) => indexer(doc, db)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') console.error('Failed to repair search vector', { entityId: batch[index].id, entityType: batch[index].type, error: result.reason });
    });
  }
}

export async function inspectSearchIndexHealth(db?: RyuDatabase): Promise<SearchIndexHealth> {
  const key = dbKey(db);
  const existing = healthPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const database = await getDatabase(db);
    const provider = getEmbeddingProvider();
    const refs = new Set<string>();
    let missingVectors = 0;
    let staleVectors = 0;

    const searchableDocuments = await visitDocumentBatches(database, async (docs) => {
      for (const doc of docs) refs.add(`${doc.type}:${doc.id}`);
      const vectors = await vectorsByIds(database, docs.map(currentVectorId));
      const byId = new Map(vectors.filter((vector) => vector.model === provider.id && vector.dimensions === provider.dimensions).map((vector) => [vector.id, vector]));
      for (const doc of docs) {
        const vector = byId.get(currentVectorId(doc));
        if (!vector) missingVectors += 1;
        else if (vector.textHash !== currentTextHash(doc)) staleVectors += 1;
      }
    });

    let vectorsForCurrentProvider = 0;
    let vectorsForOtherProviders = 0;
    let invalidVectors = 0;
    let orphanVectors = 0;
    for await (const batch of iterate<SearchVectorDoc>(database.searchvectors as never)) {
      for (const vector of batch) {
        if (vector.model === provider.id && vector.dimensions === provider.dimensions) vectorsForCurrentProvider += 1;
        else if (vector.model === provider.id) invalidVectors += 1;
        else vectorsForOtherProviders += 1;
        if (!refs.has(entityKey(vector))) orphanVectors += 1;
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
  })().finally(() => healthPromises.delete(key));

  healthPromises.set(key, promise);
  return promise;
}

async function removeVectors(db: RyuDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const collection = db.searchvectors as unknown as { bulkRemove?: (ids: string[]) => Promise<unknown>; findOne: (id: string) => { exec: () => Promise<{ remove: () => Promise<unknown> } | null> } };
  if (typeof collection.bulkRemove === 'function') {
    await collection.bulkRemove(ids);
    return;
  }
  await Promise.all(ids.map(async (id) => {
    const row = await collection.findOne(id).exec();
    if (row) await row.remove();
  }));
}

async function removeInvalidAndOrphans(db: RyuDatabase): Promise<void> {
  const provider = getEmbeddingProvider();
  const refs = await entityRefs(db);
  const ids: string[] = [];
  for await (const batch of iterate<SearchVectorDoc>(db.searchvectors as never)) {
    for (const vector of batch) {
      if ((vector.model === provider.id && vector.dimensions !== provider.dimensions) || !refs.has(entityKey(vector))) ids.push(vector.id);
    }
  }
  for (let offset = 0; offset < ids.length; offset += SEARCH_INDEX_BATCH_SIZE) {
    await removeVectors(db, ids.slice(offset, offset + SEARCH_INDEX_BATCH_SIZE)).catch((error: unknown) => console.error('Failed to remove invalid or orphan search vectors', { error }));
    await tick();
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

    await visitDocumentBatches(database, async (docs) => {
      const vectors = await vectorsByIds(database, docs.map(currentVectorId));
      const byId = new Map(vectors.filter((vector) => vector.model === provider.id && vector.dimensions === provider.dimensions).map((vector) => [vector.id, vector]));
      for (const doc of docs) {
        const vector = byId.get(currentVectorId(doc));
        if (!vector || vector.textHash !== currentTextHash(doc)) pending.push(doc);
      }
      if (pending.length >= REINDEX_CONCURRENCY) await indexBatch(database, pending.splice(0), indexer);
    });

    if (pending.length > 0) await indexBatch(database, pending, indexer);
    await removeInvalidAndOrphans(database);
  })().finally(() => repairPromises.delete(key));

  repairPromises.set(key, promise);
  return promise;
}

export async function healSearchIndexIfNeeded(db?: RyuDatabase): Promise<SearchIndexHealth> {
  const database = await getDatabase(db);
  const health = await inspectSearchIndexHealth(database);
  if (!health.healthy) scheduleSearchIndexRepair(database);
  return health;
}

export async function rebuildSearchVectorsForCurrentProvider(db?: RyuDatabase): Promise<void> {
  await repairSearchIndexHealth(db);
}

export function scheduleSearchIndexRepair(db?: RyuDatabase): void {
  const run = () => repairSearchIndexHealth(db).catch((error) => console.error('Scheduled search index repair failed', { error }));
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
  const run = () => healSearchIndexIfNeeded().catch((error) => console.error('Scheduled search index health check failed', { error }));
  if (typeof window === 'undefined') {
    run();
    return;
  }
  const browserWindow = window as WindowWithIdleCallback;
  window.setTimeout(() => {
    if (typeof browserWindow.requestIdleCallback === 'function') browserWindow.requestIdleCallback(run, { timeout: HEALTH_CHECK_STARTUP_DELAY_MS });
    else run();
  }, HEALTH_CHECK_STARTUP_DELAY_MS);
}
