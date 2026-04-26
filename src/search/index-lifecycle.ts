import { initializeDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, WorkDoc } from '../db/schema';
import { clearInMemoryVectorIndex, indexDocument } from './vector-index';
import type { SearchDocument } from './types';

const REINDEX_CONCURRENCY = 4;
let reindexPromise: Promise<void> | null = null;

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

export async function rebuildSearchVectorsForCurrentProvider(): Promise<void> {
  if (reindexPromise) return reindexPromise;

  reindexPromise = (async () => {
    const db = await initializeDatabase();
    clearInMemoryVectorIndex();

    const [editions, works, authors] = await Promise.all([
      db.editions.find().exec(),
      db.works.find().exec(),
      db.authors.find().exec()
    ]);

    const docs: SearchDocument[] = [
      ...editions.map((edition: EditionDoc) => mapEdition(edition)),
      ...works.map((work: WorkDoc) => mapWork(work)),
      ...authors.map((author: AuthorDoc) => mapAuthor(author))
    ];

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
