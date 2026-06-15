import { create, insert, remove, update, search as oramaSearch } from '@orama/orama';
import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, WorkDoc } from '../db/schema';
import { rankLexical, dedupe } from './ranking';
import { authorDocToSearchDocument } from './search-document-projection';
import { indexDocument, removeFromInMemoryVectorIndex } from './vector-index';
import type { SearchDocument } from './types';

type OramaState = {
  index: any;
  /** Map from logical key (`type:id`) → Orama internal id, so updates/removes
   *  can target the right row even though our docs aren't keyed by Orama's id. */
  oramaIds: Map<string, string>;
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

function searchDocKeyByType(type: SearchDocument['type'], id: string): string {
  return `${type}:${id}`;
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
  if (state.oramaIds.has(key) || state.pendingIds.has(key)) return;

  state.pendingIds.add(key);
  try {
    const oramaId = await insert(state.index, doc);
    await indexDocument(doc, db);
    state.oramaIds.set(key, String(oramaId));
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

async function updateDoc(state: OramaState, db: RyuDatabase, doc: SearchDocument): Promise<void> {
  const key = searchDocKey(doc);
  const existingOramaId = state.oramaIds.get(key);

  if (!existingOramaId) {
    // Not yet indexed — treat as insert.
    await addDoc(state, db, doc);
    return;
  }

  if (state.pendingIds.has(key)) return;
  state.pendingIds.add(key);

  try {
    const newOramaId = await update(state.index, existingOramaId, doc);
    state.oramaIds.set(key, String(newOramaId));
    await indexDocument(doc, db);
  } catch (error) {
    console.error('Failed to update document in lexical search index', {
      entityId: doc.id,
      entityType: doc.type,
      error
    });
  } finally {
    state.pendingIds.delete(key);
  }
}

async function removeDoc(state: OramaState, type: SearchDocument['type'], id: string): Promise<void> {
  const key = searchDocKeyByType(type, id);
  const existingOramaId = state.oramaIds.get(key);
  if (!existingOramaId) return;

  state.pendingIds.add(key);
  try {
    await remove(state.index, existingOramaId);
    state.oramaIds.delete(key);
    // Evict from in-memory vector store immediately. Persisted vector cleanup
    // is the engine adapter's responsibility (see RxDbOramaHybridSearchEngine.removeDocument).
    removeFromInMemoryVectorIndex(id);
  } catch (error) {
    console.error('Failed to remove document from lexical search index', {
      entityId: id,
      entityType: type,
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

/**
 * Reindex all editions and works that reference a particular author so that
 * the latest authorText is reflected in lexical and semantic search results.
 *
 * Called when an author is updated (e.g. renamed) so book/work search results
 * pick up the new attribution without waiting for a full repair.
 */
async function reindexAuthorDependents(
  state: OramaState,
  db: RyuDatabase,
  authorId: string
): Promise<void> {
  const cache: AuthorNameCache = new Map();
  // Pre-warm the cache with the current author so resolveAuthorNames does not
  // re-query.
  const author = await db.authors.findOne(authorId).exec().catch(() => null);
  if (author) cache.set(authorId, author.name);

  // Use a permissive selector cast — RxDB's Mango selector typings don't fully
  // model array-element matching, but the underlying engine supports it.
  const dependentEditions = await db.editions.find({
    selector: { authorIds: { $elemMatch: authorId } as any }
  }).exec().catch(() => [] as EditionDoc[]);
  const dependentWorks = await db.works.find({
    selector: { authorIds: { $elemMatch: authorId } as any }
  }).exec().catch(() => [] as WorkDoc[]);

  for (const edition of dependentEditions) {
    try {
      await updateDoc(state, db, await editionToSearchDocument(db, edition, cache));
    } catch {
      // best effort — health check repair will pick up any misses
    }
  }
  for (const work of dependentWorks) {
    try {
      await updateDoc(state, db, await workToSearchDocument(db, work, cache));
    } catch {
      // best effort
    }
  }
}

function setupReactiveIndex(state: OramaState, db: RyuDatabase): void {
  if (state.subscriptionsStarted) return;
  state.subscriptionsStarted = true;

  db.editions.$.subscribe(async (change: any) => {
    const cache: AuthorNameCache = new Map();
    if (change.operation === 'INSERT') {
      await addDoc(state, db, await editionToSearchDocument(db, change.documentData, cache));
    } else if (change.operation === 'UPDATE') {
      await updateDoc(state, db, await editionToSearchDocument(db, change.documentData, cache));
    } else if (change.operation === 'DELETE') {
      await removeDoc(state, 'edition', change.documentData.id);
    }
  });

  db.works.$.subscribe(async (change: any) => {
    const cache: AuthorNameCache = new Map();
    if (change.operation === 'INSERT') {
      await addDoc(state, db, await workToSearchDocument(db, change.documentData, cache));
    } else if (change.operation === 'UPDATE') {
      await updateDoc(state, db, await workToSearchDocument(db, change.documentData, cache));
    } else if (change.operation === 'DELETE') {
      await removeDoc(state, 'work', change.documentData.id);
    }
  });

  db.authors.$.subscribe(async (change: any) => {
    if (change.operation === 'INSERT') {
      await addDoc(state, db, authorDocToSearchDocument(change.documentData));
    } else if (change.operation === 'UPDATE') {
      await updateDoc(state, db, authorDocToSearchDocument(change.documentData));
      // Author rename affects all books/works attributing them — fan out.
      await reindexAuthorDependents(state, db, change.documentData.id);
    } else if (change.operation === 'DELETE') {
      await removeDoc(state, 'author', change.documentData.id);
    }
  });
}

async function createState(db: RyuDatabase): Promise<OramaState> {
  const state: OramaState = {
    index: await createIndex(),
    oramaIds: new Map(),
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

/**
 * Get the underlying state for an indexed database. Exposed only so the
 * hybrid engine adapter can perform synchronous removes.
 */
export async function getOramaState(db?: RyuDatabase): Promise<OramaState> {
  const database = db ?? await initializeDatabase();
  let statePromise = indexes.get(database);

  if (!statePromise) {
    statePromise = createState(database).catch((error) => {
      indexes.delete(database);
      throw error;
    });
    indexes.set(database, statePromise);
  }

  return statePromise;
}

/**
 * Remove a document directly from the lexical index by entity type + id.
 * Use this from the engine adapter when handling external delete commands.
 */
export async function removeFromOramaIndex(
  type: SearchDocument['type'],
  id: string,
  db?: RyuDatabase
): Promise<void> {
  const state = await getOramaState(db);
  await removeDoc(state, type, id);
}

/**
 * Remove all entries with the given entity id from the lexical index,
 * across all known entity types. Used when the caller doesn't know the
 * exact type (e.g. generic deleteDocument flow).
 */
export async function removeAllFromOramaIndexById(
  id: string,
  db?: RyuDatabase
): Promise<void> {
  const state = await getOramaState(db);
  await Promise.all([
    removeDoc(state, 'author', id),
    removeDoc(state, 'edition', id),
    removeDoc(state, 'work', id)
  ]);
}

export async function searchOrama(query: string, db?: RyuDatabase) {
  if (!query || query.length < 2) return [];

  const index = await getOrama(db);
  const res = await oramaSearch(index, { term: query, limit: 20 });
  const docs = res.hits.map((h: any) => h.document);

  return dedupe(rankLexical(docs, query));
}
