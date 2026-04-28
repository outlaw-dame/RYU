import { initializeDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, SearchVectorDoc, WorkDoc } from '../db/schema';
import { searchableText } from './embeddings';
import { getEmbeddingProvider } from './embedding-provider';
import { clearInMemoryVectorIndex, indexDocument } from './vector-index';
import type { SearchDocument } from './types';
import { hashText, vectorId } from './vector-utils';

const REINDEX_CONCURRENCY = 4;
const HEALTH_CHECK_STARTUP_DELAY_MS = 5_000;
let reindexPromise: Promise<void> | null = null;
let healthCheckPromise: Promise<SearchIndexHealth> | null = null;

export type SearchIndexHealth = {
  searchableDocuments: number;
  vectorsForCurrentProvider: number;
  missingVectors: number;
  staleVectors: number;
  invalidVectors: number;
  healthy: boolean;
  checkedAt: string;
};

type SearchVectorMetadata = Pick<SearchVectorDoc, 'id' | 'textHash' | 'dimensions'>;

function mapEdition(d: EditionDoc): SearchDocument {
  return {
    id: d.id,
    type: 'edition',
    title: d.title,
    description: d.description || '',
    authorText: '',
    isbnText: `${d.isbn10 || ''} ${d.isbn13 || ''}`.trim(),
    enrichmentText: '',
    source: 'local',
    updatedAt: d.updatedAt
  };
}

function mapWork(w: WorkDoc): SearchDocument {
  return {
    id: w.id,
    type: 'work',
    title: w.title,
    description: w.summary || '',
    authorText: '',
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    updatedAt: w.updatedAt
  };
}

function mapAuthor(a: AuthorDoc): SearchDocument {
  return {
    id: a.id,
    type: 'author',
    title: a.name,
    description: a.summary || '',
    authorText: a.name,
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    updatedAt: a.updatedAt
  };
}

async function visitSearchableDocuments(visitor: (doc: SearchDocument) => Promise<void> | void): Promise<number> {
  const db = await initializeDatabase();
  let count = 0;

  const editions = await db.editions.find().exec();
  for (const edition of editions as EditionDoc[]) {
    await visitor(mapEdition(edition));
    count += 1;
  }

  const works = await db.works.find().exec();
  for (const work of works as WorkDoc[]) {
    await visitor(mapWork(work));
    count += 1;
  }

  const authors = await db.authors.find().exec();
  for (const author of authors as AuthorDoc[]) {
    await visitor(mapAuthor(author));
    count += 1;
  }

  return count;
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

async function getCurrentProviderVectorMetadata(): Promise<SearchVectorMetadata[]> {
  const db = await initializeDatabase();
  const provider = getEmbeddingProvider();
  const vectors = await db.searchvectors
    .find({ selector: { model: provider.id, dimensions: provider.dimensions } })
    .exec();

  return (vectors as SearchVectorDoc[]).map(({ id, textHash, dimensions }) => ({ id, textHash, dimensions }));
}

export async function inspectSearchIndexHealth(): Promise<SearchIndexHealth> {
  if (healthCheckPromise) return healthCheckPromise;

  healthCheckPromise = (async () => {
    const provider = getEmbeddingProvider();
    const vectors = await getCurrentProviderVectorMetadata();

    const vectorById = new Map<string, SearchVectorMetadata>();
    for (const vector of vectors) {
      vectorById.set(vector.id, vector);
    }

    let searchableDocuments = 0;
    let missingVectors = 0;
    let staleVectors = 0;
    let invalidVectors = 0;

    searchableDocuments = await visitSearchableDocuments((doc) => {
      const id = vectorId(doc.id, provider.id, provider.dimensions);
      const vector = vectorById.get(id);

      if (!vector) {
        missingVectors += 1;
        return;
      }

      const textHash = hashText(searchableText(doc));
      if (vector.textHash !== textHash) staleVectors += 1;
      if (vector.dimensions !== provider.dimensions) invalidVectors += 1;
    });

    const health: SearchIndexHealth = {
      searchableDocuments,
      vectorsForCurrentProvider: vectors.length,
      missingVectors,
      staleVectors,
      invalidVectors,
      healthy: missingVectors === 0 && staleVectors === 0 && invalidVectors === 0,
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

export async function healSearchIndexIfNeeded(): Promise<SearchIndexHealth> {
  const health = await inspectSearchIndexHealth();

  if (!health.healthy) {
    console.info('Search index health check scheduled rebuild', health);
    scheduleSearchVectorRebuild();
  }

  return health;
}

export async function rebuildSearchVectorsForCurrentProvider(): Promise<void> {
  if (reindexPromise) return reindexPromise;

  reindexPromise = (async () => {
    clearInMemoryVectorIndex();
    const pending: SearchDocument[] = [];

    await visitSearchableDocuments(async (doc) => {
      pending.push(doc);

      if (pending.length >= REINDEX_CONCURRENCY) {
        const batch = pending.splice(0, pending.length);
        await indexDocumentsWithLimit(batch);
      }
    });

    if (pending.length > 0) {
      await indexDocumentsWithLimit(pending);
    }
  })().catch((error) => {
    console.error('Search vector rebuild failed', { error });
    throw error;
  }).finally(() => {
    reindexPromise = null;
  });

  return reindexPromise;
}

export function scheduleSearchVectorRebuild(): void {
  window.setTimeout(() => {
    rebuildSearchVectorsForCurrentProvider().catch((error) => {
      console.error('Scheduled search vector rebuild failed', { error });
    });
  }, 0);
}

export function scheduleSearchIndexHealthCheck(): void {
  const run = () => {
    healSearchIndexIfNeeded().catch((error) => {
      console.error('Scheduled search index health check failed', { error });
    });
  };

  if ('requestIdleCallback' in window) {
    window.setTimeout(() => {
      window.requestIdleCallback(run, { timeout: HEALTH_CHECK_STARTUP_DELAY_MS });
    }, HEALTH_CHECK_STARTUP_DELAY_MS);
    return;
  }

  window.setTimeout(run, HEALTH_CHECK_STARTUP_DELAY_MS);
}
