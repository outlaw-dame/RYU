import { initializeDatabase } from '../db/client';
import { clearInMemoryVectorIndex, indexDocument } from './vector-index';
import type { SearchDocument } from './types';

let reindexPromise: Promise<void> | null = null;

function mapEdition(d: any): SearchDocument {
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

function mapWork(w: any): SearchDocument {
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

function mapAuthor(a: any): SearchDocument {
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

    for (const edition of editions) {
      await indexDocument(mapEdition(edition));
    }

    for (const work of works) {
      await indexDocument(mapWork(work));
    }

    for (const author of authors) {
      await indexDocument(mapAuthor(author));
    }
  })().finally(() => {
    reindexPromise = null;
  });

  return reindexPromise;
}

export function scheduleSearchVectorRebuild(): void {
  window.setTimeout(() => {
    rebuildSearchVectorsForCurrentProvider().catch(() => undefined);
  }, 0);
}
