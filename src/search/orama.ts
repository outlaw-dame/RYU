import { create, insert, search as oramaSearch } from '@orama/orama';
import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, WorkDoc } from '../db/schema';
import { rankLexical, dedupe } from './ranking';
import {
  authorDocToSearchDocument,
  editionDocToSearchDocument,
  workDocToSearchDocument
} from './search-document-projection';
import { indexDocument } from './vector-index';
import type { SearchDocument } from './types';

type OramaState = {
  index: any;
  ready: Promise<void>;
  subscriptionsStarted: boolean;
};

const indexes = new Map<string, OramaState>();

async function createIndex() {
  return create({
    schema: {
      id: 'string',
      type: 'string',
      title: 'string',
      description: 'string',
      authorText: 'string',
      isbnText: 'string',
      enrichmentText: 'string'
    }
  });
}

async function addDoc(index: any, db: RyuDatabase, doc: SearchDocument): Promise<void> {
  await insert(index, doc);
  await indexDocument(doc, db);
}

async function buildIndex(index: any, db: RyuDatabase): Promise<void> {
  const editions = await db.editions.find().exec() as EditionDoc[];
  const works = await db.works.find().exec() as WorkDoc[];
  const authors = await db.authors.find().exec() as AuthorDoc[];

  for (const edition of editions) await addDoc(index, db, await editionDocToSearchDocument(db, edition));
  for (const work of works) await addDoc(index, db, await workDocToSearchDocument(db, work));
  for (const author of authors) await addDoc(index, db, authorDocToSearchDocument(author));
}

function setupReactiveIndex(state: OramaState, db: RyuDatabase): void {
  if (state.subscriptionsStarted) return;
  state.subscriptionsStarted = true;

  db.editions.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') await addDoc(state.index, db, await editionDocToSearchDocument(db, change.documentData));
  });
  db.works.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') await addDoc(state.index, db, await workDocToSearchDocument(db, change.documentData));
  });
  db.authors.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') await addDoc(state.index, db, authorDocToSearchDocument(change.documentData));
  });
}

export async function getOrama(db?: RyuDatabase) {
  const database = db ?? await initializeDatabase();
  const existing = indexes.get(database.name);
  if (existing) {
    await existing.ready;
    return existing.index;
  }

  const index = await createIndex();
  const state: OramaState = {
    index,
    ready: Promise.resolve(),
    subscriptionsStarted: false
  };
  state.ready = buildIndex(index, database);
  indexes.set(database.name, state);
  await state.ready;
  setupReactiveIndex(state, database);
  return index;
}

export async function searchOrama(query: string, db?: RyuDatabase) {
  if (!query || query.length < 2) return [];

  const index = await getOrama(db);
  const res = await oramaSearch(index, { term: query, limit: 20 });
  const docs = res.hits.map((h: any) => h.document);

  return dedupe(rankLexical(docs, query));
}
