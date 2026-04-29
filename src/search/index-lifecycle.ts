import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, SearchVectorDoc, WorkDoc } from '../db/schema';
import { searchableText } from './embeddings';
import { getEmbeddingProvider } from './embedding-provider';
import {
  authorDocToSearchDocument,
  editionDocToSearchDocument,
  workDocToSearchDocument
} from './search-document-projection';
import { clearInMemoryVectorIndex, indexDocument } from './vector-index';
import type { SearchDocument } from './types';
import { hashText, vectorId } from './vector-utils';

const REINDEX_CONCURRENCY = 4;
const SEARCH_INDEX_BATCH_SIZE = 50;
const HEALTH_CHECK_STARTUP_DELAY_MS = 5_000;
let reindexPromise: Promise<void> | null = null;
let healthCheckPromise: Promise<SearchIndexHealth> | null = null;

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

type SearchVectorMetadata = Pick<SearchVectorDoc, 'id' | 'entityId' | 'entityType' | 'model' | 'textHash' | 'dimensions'>;
type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

type SearchableEntityType = SearchDocument['type'];

type EntityRef = {
  id: string;
  type: SearchableEntityType;
};

async function getDatabase(db?: RyuDatabase): Promise<RyuDatabase> {
  return db ?? initializeDatabase();
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function findBatch<T>(collection: { find: (query: unknown) => { exec: () => Promise<T[]> } }, offset: number): Promise<T[]> {
  return collection.find({ selector: {}, skip: offset, limit: SEARCH_INDEX_BATCH_SIZE }).exec();
}

async function* iterateCollection<T>(collection: { find: (query: unknown) => { exec: () => Promise<T[]> } }): AsyncGenerator<T[]> {
  for (let offset = 0; ; offset += SEARCH_INDEX_BATCH_SIZE) {
    const batch = await findBatch<T>(collection, offset);
    if (batch.length === 0) return;
    yield batch;
    if (batch.length < SEARCH_INDEX_BATCH_SIZE) return;
    await yieldToEventLoop();
  }
}

async function documentsForBatch(db: RyuDatabase, type: SearchableEntityType, batch: Array<AuthorDoc | WorkDoc | EditionDoc>): Promise<SearchDocument[]> {
  const docs: SearchDocument[] = [];

  if (type === 'author') {
    for (const author of batch as AuthorDoc[]) docs.push(authorDocToSearchDocument(author));
    return docs;
  }

  if (type === 'work') {
    for (const work of batch as WorkDoc[]) docs.push(await workDocToSearchDocument(db, work));
    return docs;
  }

  for (const edition of batch as EditionDoc[]) docs.push(await editionDocToSearchDocument(db, edition));
  return docs;
}

async function visitSearchableDocuments(
  db: RyuDatabase,
  visitor: (doc: SearchDocument) => Promise<void> | void
): Promise<number> {
  let count = 0;

  for await (const batch of iterateCollection<EditionDoc>(db.editions as never)) {
    const docs = await documentsForBatch(db, 'edition', batch);
    for (const doc of docs) {
      await visitor(doc);
      count += 1;
    }
  }

  for await (const batch of iterateCollection<WorkDoc>(db.works as never)) {
    const docs = await documentsForBatch(db, 'work', batch);
    for (const doc of docs) {
      await visitor(doc);
      count += 1;
    }
  }

  for await (const batch of iterateCollection<AuthorDoc>(db.authors as never)) {
    const docs = await documentsForBatch(db, 'author', batch);
    for (const doc of docs) {
      await visitor(doc);
      count += 1;
    }
  }

  return count;
}

async function collectSearchableEntityRefs(db: RyuDatabase): Promise<Set<string>> {
  const refs = new Set<string>();

  for await (const batch of iterateCollection<EditionDoc>(db.editions as never)) {
    for (const edition of batch) refs.add(`edition:${edition.id}`);
  }

  for await (const batch of iterateCollection<WorkDoc>(db.works as never)) {
    for (const work of batch) refs.add(`work:${work.id}`);
  }

  for await (const batch of iterateCollection<AuthorDoc>(db.authors as never)) {
    for (const author of batch) refs.add(`author:${author.id}`);
  }

  return refs;
}

function vectorEntityKey(vector: Pick<SearchVectorDoc, 'entityType' | 'entityId'>): string {
  return `${vector.entityType}:${vector.entityId}`;
}

async function getSearchVectors(db: RyuDatabase): Promise<SearchVectorMetadata[]> {
  const vectors: SearchVectorMetadata[] = [];

  for await (const batch of iterateCollection<SearchVectorDoc>(db.searchvectors as never)) {
    for (const vector of batch) {
      vectors.push({
        id: vector.id,
        entityId: vector.entityId,
        entityType: vector.entityType,
        model: vector.model,
        textHash: vector.textHash,
        dimensions: vector.dimensions
      });
    }
  }

  return vectors;
}

async function indexDocumentsWithLimit(docs: SearchDocument[]): Promise<void> {
  for (let offset = 0; offset < docs.length; offset += REINDEX_CONCURRENCY) {
    const batch = docs.slice(offset, offset + REINDEX_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((doc) => indexDocument(doc)));

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('Failed to rebuild search vector', {
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
  if (healthCheckPromise) return healthCheckPromise;

  healthCheckPromise = (async () => {
    const database = await getDatabase(db);
    const provider = getEmbeddingProvider();
    const vectors = await getSearchVectors(database);
    const currentVectors = vectors.filter((vector) => vector.model === provider.id && vector.dimensions === provider.dimensions);
    const currentVectorById = new Map(currentVectors.map((vector) => [vector.id, vector]));
    const entityRefs = await collectSearchableEntityRefs(database);

    let searchableDocuments = 0;
    let missingVectors = 0;
    let staleVectors = 0;
    let invalidVectors = 0;

    searchableDocuments = await visitSearchableDocuments(database, (doc) => {
      const vector = currentVectorById.get(currentVectorId(doc));

      if (!vector) {
        missingVectors += 1;
        return;
      }

      if (vector.textHash !== currentTextHash(doc)) staleVectors += 1;
      if (vector.dimensions !== provider.dimensions) invalidVectors += 1;
    });

    let orphanVectors = 0;
    for (const vector of vectors) {
      if (!entityRefs.has(vectorEntityKey(vector))) orphanVectors += 1;
    }

    const health: SearchIndexHealth = {
      searchableDocuments,
      vectorsForCurrentProvider: currentVectors.length,
      vectorsForOtherProviders: vectors.length - currentVectors.length,
      missingVectors,
      staleVectors,
      invalidVectors,
      orphanVectors,
      healthy: missingVectors === 0 && staleVectors === 0 && invalidVectors === 0 && orphanVectors === 0,
      checkedAt: new Date().toISOString()
    };

    return health;
  })().catch((error) => {
    console.error('Search index health check failed', { error });
    throw error;
  }).finally(() => {
    healthCheckPromise = null;
  });

  return healthCheckPromise;
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

async function removeOrphanVectors(db: RyuDatabase): Promise<void> {
  const entityRefs = await collectSearchableEntityRefs(db);
  const orphanIds: string[] = [];

  for await (const batch of iterateCollection<SearchVectorDoc>(db.searchvectors as never)) {
    for (const vector of batch) {
      if (!entityRefs.has(vectorEntityKey(vector))) orphanIds.push(vector.id);
    }
  }

  for (let offset = 0; offset < orphanIds.length; offset += SEARCH_INDEX_BATCH_SIZE) {
    await removeVectors(db, orphanIds.slice(offset, offset + SEARCH_INDEX_BATCH_SIZE)).catch((error: unknown) => {
      console.error('Failed to remove orphan search vectors', { error });
    });
    await yieldToEventLoop();
  }
}

export async function repairSearchIndexHealth(db?: RyuDatabase): Promise<void> {
  if (reindexPromise) return reindexPromise;

  reindexPromise = (async () => {
    const database = await getDatabase(db);
    const provider = getEmbeddingProvider();
    const vectors = await getSearchVectors(database);
    const currentVectorById = new Map(
      vectors
        .filter((vector) => vector.model === provider.id && vector.dimensions === provider.dimensions)
        .map((vector) => [vector.id, vector])
    );
    const pending: SearchDocument[] = [];

    clearInMemoryVectorIndex();

    await visitSearchableDocuments(database, async (doc) => {
      const vector = currentVectorById.get(currentVectorId(doc));
      const needsRepair = !vector || vector.textHash !== currentTextHash(doc) || vector.dimensions !== provider.dimensions;
      if (!needsRepair) return;

      pending.push(doc);
      if (pending.length >= REINDEX_CONCURRENCY) {
        const batch = pending.splice(0, pending.length);
        await indexDocumentsWithLimit(batch);
      }
    });

    if (pending.length > 0) await indexDocumentsWithLimit(pending);
    await removeOrphanVectors(database);
  })().catch((error) => {
    console.error('Search index repair failed', { error });
    throw error;
  }).finally(() => {
    reindexPromise = null;
  });

  return reindexPromise;
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
    repairSearchIndexHealth().catch((error) => {
      console.error('Scheduled search index repair failed', { error });
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
