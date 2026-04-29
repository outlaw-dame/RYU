import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import type { RyuCollections, RyuDatabase } from '../src/db/client';
import { collections } from '../src/db/runtime-schema';
import { registerEmbeddingProvider, resetEmbeddingProvider } from '../src/search/embedding-provider';
import { createSearchIndexQueue } from '../src/search/write-through-indexing';
import { vectorId } from '../src/search/vector-utils';

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

type RuntimeCollections = Parameters<RyuDatabase['addCollections']>[0];

const now = '2026-01-01T00:00:00.000Z';
const model = 'db-scoped-vector-eval';
const dimensions = 4;
const authorId = 'author:db-scoped';
const workId = 'work:db-scoped';

const testCollections = {
  authors: collections.authors,
  works: collections.works,
  searchvectors: collections.searchvectors
} as unknown as RuntimeCollections;

function embed(text: string): number[] {
  const checksum = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return [checksum % 97, text.length % 97, (checksum + text.length) % 97, 1];
}

async function main(): Promise<void> {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  registerEmbeddingProvider({ id: model, dimensions, embed });

  const db = await createRxDatabase<RyuCollections>({
    name: `ryu_db_scoped_vector_${Date.now()}`,
    storage: getRxStorageDexie(),
    multiInstance: false
  });

  try {
    await db.addCollections(testCollections);
    await db.authors.insert({ id: authorId, name: 'DB Scoped Author', importedAt: now, updatedAt: now });
    await db.works.insert({ id: workId, title: 'DB Scoped Work', summary: 'Vector writes should use the caller DB.', authorIds: [authorId], importedAt: now, updatedAt: now });

    const queue = createSearchIndexQueue({ concurrency: 1, maxSize: 10 });
    queue.enqueue(db, {
      kind: 'work',
      id: workId,
      title: 'DB Scoped Work',
      summary: 'Vector writes should use the caller DB.',
      authorIds: [authorId]
    }, now);
    await queue.idle();

    const vector = await db.searchvectors.findOne(vectorId(workId, model, dimensions)).exec();
    assertOk(Boolean(vector), 'default queue indexer should write vector into the caller DB');
    assertOk(vector?.entityId === workId, 'vector should belong to the indexed work');
    assertOk(vector?.entityType === 'work', 'vector should preserve entity type');
    assertOk(vector?.model === model, 'vector should use active provider model');
    assertOk(vector?.dimensions === dimensions, 'vector should use active provider dimensions');

    console.log('DB-scoped vector indexing guardrail passed.');
  } finally {
    resetEmbeddingProvider();
    await db.remove();
  }
}

await main();
