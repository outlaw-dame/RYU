import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { createRxDBActivityPubStore, ingestActivityPubGraph } from '../src/db/activitypub-ingest';
import type { RyuCollections, RyuDatabase } from '../src/db/client';
import { collections } from '../src/db/runtime-schema';
import { findSearchDependentsForAuthor } from '../src/search/search-index-dependencies';
import { rebuildSearchIndexDependencies } from '../src/search/search-index-dependency-lifecycle';
import { createSearchIndexQueue } from '../src/search/write-through-indexing';
import type { SearchDocument } from '../src/search/types';
import type { CanonicalApGraph } from '../src/sync/activitypub-client';

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

type RuntimeCollections = Parameters<RyuDatabase['addCollections']>[0];

const authorId = 'https://books.example/author/ursula';
const workId = 'https://books.example/work/dispossessed';
const editionId = 'https://books.example/edition/dispossessed';

const graph: CanonicalApGraph = {
  rootId: editionId,
  entities: [
    {
      kind: 'edition',
      id: editionId,
      title: 'The Dispossessed',
      description: 'Paperback edition.',
      authorIds: [authorId],
      workId,
      isbn13: '9780061054884',
      sourceUrl: 'https://books.example/edition/dispossessed'
    },
    {
      kind: 'work',
      id: workId,
      title: 'The Dispossessed',
      summary: 'An ambiguous utopia.',
      authorIds: [authorId]
    },
    {
      kind: 'author',
      id: authorId,
      name: 'Ursula K. Le Guin',
      summary: 'Author of speculative fiction.'
    }
  ]
};

const e2eCollections = {
  authors: collections.authors,
  works: collections.works,
  editions: collections.editions,
  entityresolutions: collections.entityresolutions,
  searchindexdependencies: collections.searchindexdependencies
} as unknown as RuntimeCollections;

function docIdsByType(docs: SearchDocument[], type: SearchDocument['type']): string[] {
  return docs.filter((doc) => doc.type === type).map((doc) => doc.id).sort();
}

async function main(): Promise<void> {
  addRxPlugin(RxDBMigrationSchemaPlugin);

  const db = await createRxDatabase<RyuCollections>({
    name: `ryu_ap_ingest_e2e_${Date.now()}`,
    storage: getRxStorageDexie(),
    multiInstance: false
  });

  const indexed: SearchDocument[] = [];
  const queue = createSearchIndexQueue({
    concurrency: 1,
    maxSize: 20,
    indexer: async (doc) => {
      indexed.push(doc);
    },
    logger: { error: () => undefined, warn: () => undefined }
  });

  try {
    await db.addCollections(e2eCollections);
    const store = createRxDBActivityPubStore(db, queue, false);

    await ingestActivityPubGraph(graph, store);
    await queue.idle();

    assertOk(docIdsByType(indexed, 'author').join(',') === authorId, 'initial import should index the author');
    assertOk(docIdsByType(indexed, 'work').join(',') === workId, 'initial import should index the work');
    assertOk(docIdsByType(indexed, 'edition').join(',') === editionId, 'initial import should index the edition');

    const dependencyRows = await db.searchindexdependencies.find({ selector: { authorId } }).exec();
    const dependencyIds = dependencyRows.map((row) => `${row.entityType}:${row.entityId}`).sort();
    assertOk(dependencyIds.join(',') === `edition:${editionId},work:${workId}`, 'ingest should maintain work and edition dependency rows');

    const projectedWork = indexed.find((doc) => doc.id === workId);
    const projectedEdition = indexed.find((doc) => doc.id === editionId);
    assertOk(projectedWork?.authorText === 'Ursula K. Le Guin', 'work projection should use resolved author name');
    assertOk(projectedEdition?.authorText === 'Ursula K. Le Guin', 'edition projection should use resolved author name');

    const dependents = await findSearchDependentsForAuthor(db, authorId);
    assertOk(dependents.map((entity) => entity.id).sort().join(',') === `${editionId},${workId}`, 'author dependency lookup should hydrate dependent work and edition');

    await rebuildSearchIndexDependencies(db);
    const afterFirstBackfill = await db.searchindexdependencies.find().exec();
    await rebuildSearchIndexDependencies(db);
    const afterSecondBackfill = await db.searchindexdependencies.find().exec();
    assertOk(afterFirstBackfill.length === 2, 'dependency backfill should preserve two rows');
    assertOk(afterSecondBackfill.length === 2, 'repeated dependency backfill should be idempotent');

    indexed.length = 0;
    await store.upsertAuthor({
      kind: 'author',
      id: authorId,
      name: 'Ursula Kroeber Le Guin',
      summary: 'Updated author summary.'
    });
    await queue.idle();

    const fanoutIds = indexed.map((doc) => `${doc.type}:${doc.id}`).sort();
    assertOk(
      fanoutIds.join(',') === `author:${authorId},edition:${editionId},work:${workId}`,
      'author update should reindex author plus dependent work and edition'
    );

    const fanoutWork = indexed.find((doc) => doc.id === workId);
    const fanoutEdition = indexed.find((doc) => doc.id === editionId);
    assertOk(fanoutWork?.authorText === 'Ursula Kroeber Le Guin', 'dependent work should reproject updated author name');
    assertOk(fanoutEdition?.authorText === 'Ursula Kroeber Le Guin', 'dependent edition should reproject updated author name');

    console.log('ActivityPub dependency indexing e2e passed.');
  } finally {
    await db.remove();
  }
}

await main();
