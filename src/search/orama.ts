import { create, insert, search as oramaSearch } from '@orama/orama';
import { initializeDatabase } from '@/db/client';
import { rankLexical, dedupe } from './ranking';
import { indexDocument } from './vector-index';
import type { SearchDocument } from './types';

let orama: any;
let initialized = false;

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
    description: '',
    authorText: a.name,
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    updatedAt: a.updatedAt
  };
}

async function buildIndex() {
  const db = await initializeDatabase();

  const editions = await db.editions.find().exec();
  const works = await db.works.find().exec();
  const authors = await db.authors.find().exec();

  for (const d of editions) {
    const doc = mapEdition(d);
    await insert(orama, doc);
    indexDocument(doc);
  }

  for (const w of works) {
    const doc = mapWork(w);
    await insert(orama, doc);
    indexDocument(doc);
  }

  for (const a of authors) {
    const doc = mapAuthor(a);
    await insert(orama, doc);
    indexDocument(doc);
  }
}

async function setupReactiveIndex() {
  const db = await initializeDatabase();

  db.editions.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') {
      const doc = mapEdition(change.documentData);
      await insert(orama, doc);
      indexDocument(doc);
    }
  });

  db.works.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') {
      const doc = mapWork(change.documentData);
      await insert(orama, doc);
      indexDocument(doc);
    }
  });

  db.authors.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') {
      const doc = mapAuthor(change.documentData);
      await insert(orama, doc);
      indexDocument(doc);
    }
  });
}

export async function getOrama() {
  if (orama) return orama;

  orama = await create({
    schema: {
      id: 'string',
      type: 'string',
      title: 'string',
      description: 'string'
    }
  });

  await buildIndex();

  if (!initialized) {
    initialized = true;
    setupReactiveIndex().catch(() => {});
  }

  return orama;
}

export async function searchOrama(query: string) {
  if (!query || query.length < 2) return [];

  const db = await getOrama();

  const res = await oramaSearch(db, {
    term: query,
    limit: 20
  });

  const docs = res.hits.map((h: any) => h.document);

  return dedupe(rankLexical(docs, query));
}
