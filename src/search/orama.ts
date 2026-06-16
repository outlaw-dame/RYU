import { create, insert, remove, update, search as oramaSearch } from '@orama/orama';
import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, ReviewDoc, WorkDoc } from '../db/schema';
import { rankLexical, dedupe } from './ranking';
import { authorDocToSearchDocument, reviewDocToSearchDocument } from './search-document-projection';
import { indexDocument, removeFromInMemoryVectorIndex } from './vector-index';
import type { SearchDocument } from './types';

type OramaState = {
  index: any;
  /** Map from logical key (`type:id`) → Orama internal id, so updates/removes
   *  can target the right row even though our docs aren't keyed by Orama's id. */
  oramaIds: Map<string, string>;
  /** Per-key in-flight promise so concurrent updates/deletes for the same
   *  document are queued instead of dropped. */
  pendingPromises: Map<string, Promise<void>>;
  subscriptionsStarted: boolean;
  database: RyuDatabase;
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

/**
 * Run `task` after any in-flight task for the same key, then update the
 * pendingPromises map. Errors are caught so a failed task does not block
 * subsequent ones.
 */
function chainPending(state: OramaState, key: string, task: () => Promise<void>): Promise<void> {
  const previous = state.pendingPromises.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      // Only clear if this is still the most recent promise for the key.
      if (state.pendingPromises.get(key) === next) {
        state.pendingPromises.delete(key);
      }
    });
  state.pendingPromises.set(key, next);
  return next;
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

  return chainPending(state, key, async () => {
    if (state.oramaIds.has(key)) {
      // Already indexed — treat as update.
      await updateDocInner(state, db, doc, key);
      return;
    }
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
    }
  });
}

async function updateDocInner(state: OramaState, db: RyuDatabase, doc: SearchDocument, key: string): Promise<void> {
  const existingOramaId = state.oramaIds.get(key);
  if (!existingOramaId) {
    // Not indexed — fall back to insert.
    try {
      const oramaId = await insert(state.index, doc);
      await indexDocument(doc, db);
      state.oramaIds.set(key, String(oramaId));
    } catch (error) {
      console.error('Failed to insert (during update) document into lexical search index', {
        entityId: doc.id,
        entityType: doc.type,
        error
      });
    }
    return;
  }

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
  }
}

async function updateDoc(state: OramaState, db: RyuDatabase, doc: SearchDocument): Promise<void> {
  const key = searchDocKey(doc);
  return chainPending(state, key, () => updateDocInner(state, db, doc, key));
}

/**
 * Clean up persisted vectors from RxDB for the given entity id.
 * Used by the reactive DELETE path so reload via warmSemanticVectorIndex
 * does not bring deleted entities back from the dead.
 */
async function removePersistedVectors(db: RyuDatabase, id: string): Promise<void> {
  try {
    const collection = db.searchvectors;
    if (!collection) return;
    const docs = await collection.find({ selector: { entityId: id } }).exec();
    await Promise.all(docs.map((doc: any) => doc.remove()));
  } catch (error) {
    console.error('Failed to remove persisted vectors for deleted entity', { id, error });
  }
}

async function removeDoc(state: OramaState, type: SearchDocument['type'], id: string): Promise<void> {
  const key = searchDocKeyByType(type, id);

  return chainPending(state, key, async () => {
    const existingOramaId = state.oramaIds.get(key);

    // Always evict in-memory vector and persisted vector even if the lexical
    // entry is missing — the persisted row could survive across reloads.
    removeFromInMemoryVectorIndex(id);
    await removePersistedVectors(state.database, id);

    if (!existingOramaId) return;

    try {
      await remove(state.index, existingOramaId);
      state.oramaIds.delete(key);
    } catch (error) {
      console.error('Failed to remove document from lexical search index', {
        entityId: id,
        entityType: type,
        error
      });
    }
  });
}

async function buildIndex(state: OramaState, db: RyuDatabase): Promise<void> {
  const authors = await db.authors.find().exec() as AuthorDoc[];
  const cache: AuthorNameCache = new Map(authors.map((author) => [author.id, author.name]));
  const editions = await db.editions.find().exec() as EditionDoc[];
  const works = await db.works.find().exec() as WorkDoc[];

  for (const edition of editions) await addDoc(state, db, await editionToSearchDocument(db, edition, cache));
  for (const work of works) await addDoc(state, db, await workToSearchDocument(db, work, cache));
  for (const author of authors) await addDoc(state, db, authorDocToSearchDocument(author));

  // Index reviews (collection may not exist in all database configurations)
  if (db.reviews) {
    const reviews = await db.reviews.find().exec() as ReviewDoc[];
    const editionTitleCache = new Map<string, string>(editions.map((e) => [e.id, e.title]));
    for (const review of reviews) await addDoc(state, db, await reviewDocToSearchDocument(db, review, editionTitleCache));
  }
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
  const author = await db.authors.findOne(authorId).exec().catch(() => null);
  if (author) cache.set(authorId, author.name);

  // RxDB Mango: $in checks array membership for primitive arrays.
  const dependentEditions = await db.editions.find({
    selector: { authorIds: { $in: [authorId] } }
  }).exec().catch(() => [] as EditionDoc[]);
  const dependentWorks = await db.works.find({
    selector: { authorIds: { $in: [authorId] } }
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

/**
 * Extract the entity id from an RxDB change event, regardless of operation.
 * INSERT/UPDATE expose `documentData.id`. DELETE may expose only
 * `documentId` and/or `previousDocumentData.id`.
 */
function extractChangeId(change: any): string | null {
  return (
    change?.documentId ??
    change?.documentData?.id ??
    change?.previousDocumentData?.id ??
    null
  );
}

function setupReactiveIndex(state: OramaState, db: RyuDatabase): void {
  if (state.subscriptionsStarted) return;
  state.subscriptionsStarted = true;

  db.editions.$.subscribe((change: any) => {
    const run = async () => {
      const cache: AuthorNameCache = new Map();
      if (change.operation === 'INSERT') {
        await addDoc(state, db, await editionToSearchDocument(db, change.documentData, cache));
      } else if (change.operation === 'UPDATE') {
        await updateDoc(state, db, await editionToSearchDocument(db, change.documentData, cache));
      } else if (change.operation === 'DELETE') {
        const id = extractChangeId(change);
        if (id) await removeDoc(state, 'edition', id);
      }
    };
    run().catch((error) => {
      console.error('Error in editions subscription handler', { change, error });
    });
  });

  db.works.$.subscribe((change: any) => {
    const run = async () => {
      const cache: AuthorNameCache = new Map();
      if (change.operation === 'INSERT') {
        await addDoc(state, db, await workToSearchDocument(db, change.documentData, cache));
      } else if (change.operation === 'UPDATE') {
        await updateDoc(state, db, await workToSearchDocument(db, change.documentData, cache));
      } else if (change.operation === 'DELETE') {
        const id = extractChangeId(change);
        if (id) await removeDoc(state, 'work', id);
      }
    };
    run().catch((error) => {
      console.error('Error in works subscription handler', { change, error });
    });
  });

  db.authors.$.subscribe((change: any) => {
    const run = async () => {
      if (change.operation === 'INSERT') {
        await addDoc(state, db, authorDocToSearchDocument(change.documentData));
      } else if (change.operation === 'UPDATE') {
        await updateDoc(state, db, authorDocToSearchDocument(change.documentData));
        // Author rename affects all books/works attributing them — fan out.
        await reindexAuthorDependents(state, db, change.documentData.id);
      } else if (change.operation === 'DELETE') {
        const id = extractChangeId(change);
        if (id) await removeDoc(state, 'author', id);
      }
    };
    run().catch((error) => {
      console.error('Error in authors subscription handler', { change, error });
    });
  });

  if (db.reviews) {
    db.reviews.$.subscribe((change: any) => {
      const run = async () => {
        if (change.operation === 'INSERT') {
          await addDoc(state, db, await reviewDocToSearchDocument(db, change.documentData));
        } else if (change.operation === 'UPDATE') {
          await updateDoc(state, db, await reviewDocToSearchDocument(db, change.documentData));
        } else if (change.operation === 'DELETE') {
          const id = extractChangeId(change);
          if (id) await removeDoc(state, 'review', id);
        }
      };
      run().catch((error) => {
        console.error('Error in reviews subscription handler', { change, error });
      });
    });
  }
}

async function createState(db: RyuDatabase): Promise<OramaState> {
  const state: OramaState = {
    index: await createIndex(),
    oramaIds: new Map(),
    pendingPromises: new Map(),
    subscriptionsStarted: false,
    database: db
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
    removeDoc(state, 'work', id),
    removeDoc(state, 'review', id)
  ]);
}

export async function searchOrama(query: string, db?: RyuDatabase) {
  if (!query || query.length < 2) return [];

  const index = await getOrama(db);
  const res = await oramaSearch(index, { term: query, limit: 20 });
  const docs = res.hits.map((h: any) => h.document);

  return dedupe(rankLexical(docs, query));
}
