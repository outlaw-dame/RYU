import { create, insert, search as oramaSearch } from '@orama/orama';
import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, WorkDoc } from '../db/schema';
import { rankLexical, dedupe } from './ranking';
import { authorDocToSearchDocument } from './search-document-projection';
import { indexDocument } from './vector-index';
import type { SearchDocument } from './types';

type OramaState = {
  index: any;
  indexedIds: Set<string>;
  pendingIds: Set<string>;
  subscriptionsStarted: boolean;
};

type AuthorNameCache = Map<string, string>;

const indexes = new WeakMap<RyuDatabase, Promise<OramaState>>();

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

function searchDocKey(doc: SearchDocument): string {
  return `${doc.type}:${doc.id}`;
}

async function resolveAuthorNames(db: RyuDatabase, authorIds: string[], cache: AuthorNameCache): Promise<string> {
  const uniqueIds = [...new Set(authorIds)];
  for (const id of uniqueIds) {
    if (cache.has(id)) continue;
    const author = await db.authors.findOne(id).exec().catch(() => null);
    cache.set(id, author?.name || id);
  }
  return uniqueIds.map((id) => cache.get(id) || id).join(' ');
}

async function editionToSearchDocument(db: RyuDatabase, edition: EditionDoc, cache: AuthorNameCache): Promise<SearchDocument> {
  return {
    id: edition.id,
    type: 'edition',
    title: edition.title,
    description: edition.description || '',
    authorText: await resolveAuthorNames(db, edition.authorIds, cache),
    isbnText: `${edition.isbn10 || ''} ${edition.isbn13 || ''}`.trim(),
    enrichmentText: edition.subtitle || '',
    source: 'local',
    updatedAt: edition.updatedAt
  };
}

async function workToSearchDocument(db: RyuDatabase, work: WorkDoc, cache: AuthorNameCache): Promise<SearchDocument> {
  return {
    id: work.id,
    type: 'work',
    title: work.title,
    description: work.summary || '',
    authorText: await resolveAuthorNames(db, work.authorIds, cache),
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    updatedAt: work.updatedAt
  };
}

async function addDoc(state: OramaState, db: RyuDatabase, doc: SearchDocument): Promise<void> {
  const key = searchDocKey(doc);
  if (state.indexedIds.has(key) || state.pendingIds.has(key)) return;

  state.pendingIds.add(key);
  try {
    await insert(state.index, doc);
    await indexDocument(doc, db);
    state.indexedIds.add(key);
  } catch (error) {
    console.error('Failed to add document to lexical search index', {
      entityId: doc.id,
      entityType: doc.type,
      error
    });
  } finally {
    state.pendingIds.delete(key);
  }
}

async function buildIndex(state: OramaState, db: RyuDatabase): Promise<void> {
  const authors = await db.authors.find().exec() as AuthorDoc[];
  const cache: AuthorNameCache = new Map(authors.map((author) => [author.id, author.name]));
  const editions = await db.editions.find().exec() as EditionDoc[];
  const works = await db.works.find().exec() as WorkDoc[];

  for (const edition of editions) await addDoc(state, db, await editionToSearchDocument(db, edition, cache));
  for (const work of works) await addDoc(state, db, await workToSearchDocument(db, work, cache));
  for (const author of authors) await addDoc(state, db, authorDocToSearchDocument(author));
}

function setupReactiveIndex(state: OramaState, db: RyuDatabase): void {
  if (state.subscriptionsStarted) return;
  state.subscriptionsStarted = true;

  db.editions.$.subscribe(async (change: any) => {
    if (change.operation !== 'INSERT') return;
    const cache: AuthorNameCache = new Map();
    await addDoc(state, db, await editionToSearchDocument(db, change.documentData, cache));
  });

  db.works.$.subscribe(async (change: any) => {
    if (change.operation !== 'INSERT') return;
    const cache: AuthorNameCache = new Map();
    await addDoc(state, db, await workToSearchDocument(db, change.documentData, cache));
  });

  db.authors.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') await addDoc(state, db, authorDocToSearchDocument(change.documentData));
  });
}

async function createState(db: RyuDatabase): Promise<OramaState> {
  const state: OramaState = {
    index: await createIndex(),
    indexedIds: new Set(),
    pendingIds: new Set(),
    subscriptionsStarted: false
  };
  setupReactiveIndex(state, db);
  await buildIndex(state, db);
  return state;
}

export async function getOrama(db?: RyuDatabase) {
  const database = db ?? await initializeDatabase();
  let statePromise = indexes.get(database);

  if (!statePromise) {
    statePromise = createState(database).catch((error) => {
      indexes.delete(database);
      throw error;
    });
    indexes.set(database, statePromise);
  }

  const state = await statePromise;
  return state.index;
}

export async function searchOrama(query: string, db?: RyuDatabase) {
  if (!query || query.length < 2) return [];

  const index = await getOrama(db);
  const res = await oramaSearch(index, { term: query, limit: 20 });
  const docs = res.hits.map((h: any) => h.document);

  return dedupe(rankLexical(docs, query));
}
