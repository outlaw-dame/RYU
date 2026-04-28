import { initializeDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, SearchVectorDoc, WorkDoc } from '../db/schema';
import { searchableText } from './embeddings';
import { getEmbeddingProvider } from './embedding-provider';
import { clearInMemoryVectorIndex, indexDocument } from './vector-index';
import type { SearchDocument } from './types';

const REINDEX_CONCURRENCY = 4;
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

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function vectorId(entityId: string, model: string, dimensions: number): string {
  return `${model}:${dimensions}:${entityId}`;
}

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

async function getSearchableDocuments(): Promise<SearchDocument[]> {
  const db = await initializeDatabase();
  const [editions, works, authors] = await Promise.all([
    db.editions.find().exec(),
    db.works.find().exec(),
    db.authors.find().exec()
  ]);

  return [
    ...editions.map((edition: EditionDoc) => mapEdition(edition)),
    ...works.map((work: WorkDoc) => mapWork(work)),
    ...authors.map((author: AuthorDoc) => mapAuthor(author))
  ];
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

export async function inspectSearchIndexHealth(): Promise<SearchIndexHealth> {
  if (healthCheckPromise) return healthCheckPromise;

  healthCheckPromise = (async () => {
    const db = await initializeDatabase();
    const provider = getEmbeddingProvider();
    const docs = await getSearchableDocuments();
    const vectors = await db.searchvectors
      .find({ selector: { model: provider.id, dimensions: provider.dimensions } })
      .exec();

    const vectorById = new Map<string, SearchVectorDoc>();
    for (const vector of vectors as SearchVectorDoc[]) {
      vectorById.set(vector.id, vector);
    }

    let missingVectors = 0;
    let staleVectors = 0;
    let invalidVectors = 0;

    for (const doc of docs) {
      const id = vectorId(doc.id, provider.id, provider.dimensions);
      const vector = vectorById.get(id);

      if (!vector) {
        missingVectors += 1;
        continue;
      }

      const textHash = hashText(searchableText(doc));
      if (vector.textHash !== textHash) staleVectors += 1;
      if (vector.vector.length !== provider.dimensions) invalidVectors += 1;
    }

    const health: SearchIndexHealth = {
      searchableDocuments: docs.length,
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
    const docs = await getSearchableDocuments();
    await indexDocumentsWithLimit(docs);
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
  window.setTimeout(() => {
    healSearchIndexIfNeeded().catch((error) => {
      console.error('Scheduled search index health check failed', { error });
    });
  }, 0);
}
