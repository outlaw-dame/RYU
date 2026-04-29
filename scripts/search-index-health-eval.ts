import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import type { RyuCollections, RyuDatabase } from '../src/db/client';
import { collections } from '../src/db/runtime-schema';
import { searchableText } from '../src/search/embeddings';
import { registerEmbeddingProvider, resetEmbeddingProvider } from '../src/search/embedding-provider';
import { inspectSearchIndexHealth, repairSearchIndexHealth } from '../src/search/index-lifecycle';
import type { SearchDocument } from '../src/search/types';
import { hashText, vectorId } from '../src/search/vector-utils';

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

type RuntimeCollections = Parameters<RyuDatabase['addCollections']>[0];

const now = '2026-01-01T00:00:00.000Z';
const model = 'health-eval-v1';
const dimensions = 3;
const authorId = 'author:ursula';
const workId = 'work:dispossessed';
const editionId = 'edition:dispossessed';

const healthCollections = {
  authors: collections.authors,
  works: collections.works,
  editions: collections.editions,
  searchvectors: collections.searchvectors
} as unknown as RuntimeCollections;

function embed(text: string): number[] {
  const base = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return [base % 101, text.length % 101, (base + text.length) % 101];
}

async function writeVector(db: RyuDatabase, doc: SearchDocument, textHash = hashText(searchableText(doc))): Promise<void> {
  await db.searchvectors.upsert({
    id: vectorId(doc.id, model, dimensions),
    entityId: doc.id,
    entityType: doc.type,
    model,
    dimensions,
    textHash,
    vector: embed(searchableText(doc)),
    indexedAt: now,
    updatedAt: now
  });
}

async function fakeIndexer(doc: SearchDocument, db: RyuDatabase): Promise<void> {
  await writeVector(db, doc);
}

async function main(): Promise<void> {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  registerEmbeddingProvider({ id: model, dimensions, embed });

  const db = await createRxDatabase<RyuCollections>({
    name: `ryu_search_health_${Date.now()}`,
    storage: getRxStorageDexie(),
    multiInstance: false
  });

  try {
    await db.addCollections(healthCollections);

    await db.authors.insert({ id: authorId, name: 'Ursula K. Le Guin', importedAt: now, updatedAt: now });
    await db.works.insert({ id: workId, title: 'The Dispossessed', summary: 'Original summary.', authorIds: [authorId], importedAt: now, updatedAt: now });
    await db.editions.insert({ id: editionId, title: 'The Dispossessed', description: 'Paperback edition.', authorIds: [authorId], sourceUrl: 'https://books.example/dispossessed', importedAt: now, updatedAt: now });

    const missingHealth = await inspectSearchIndexHealth(db);
    assertOk(missingHealth.searchableDocuments === 3, 'health should inspect three searchable entities');
    assertOk(missingHealth.missingVectors === 3, 'health should detect missing vectors');
    assertOk(missingHealth.healthy === false, 'health should report unhealthy when vectors are missing');

    await repairSearchIndexHealth(db, { indexer: fakeIndexer });
    const repairedHealth = await inspectSearchIndexHealth(db);
    assertOk(repairedHealth.healthy === true, 'repair should create missing vectors');
    assertOk(repairedHealth.vectorsForCurrentProvider === 3, 'repair should create three current-provider vectors');

    const workVector = await db.searchvectors.findOne(vectorId(workId, model, dimensions)).exec();
    assertOk(Boolean(workVector), 'work vector should exist after repair');
    await workVector!.incrementalPatch({ textHash: 'stale-text-hash' });

    const staleHealth = await inspectSearchIndexHealth(db);
    assertOk(staleHealth.staleVectors === 1, 'health should detect stale vector text hash');

    await db.searchvectors.upsert({
      id: 'invalid-dimension-vector',
      entityId: authorId,
      entityType: 'author',
      model,
      dimensions: 2,
      textHash: 'invalid-dimensions',
      vector: [1, 2],
      indexedAt: now,
      updatedAt: now
    });

    await db.searchvectors.upsert({
      id: vectorId('work:missing', model, dimensions),
      entityId: 'work:missing',
      entityType: 'work',
      model,
      dimensions,
      textHash: 'orphan',
      vector: [1, 2, 3],
      indexedAt: now,
      updatedAt: now
    });

    const brokenHealth = await inspectSearchIndexHealth(db);
    assertOk(brokenHealth.staleVectors === 1, 'health should retain stale-vector count before repair');
    assertOk(brokenHealth.invalidVectors === 1, 'health should detect invalid dimension vector');
    assertOk(brokenHealth.orphanVectors === 1, 'health should detect orphan vector');

    await repairSearchIndexHealth(db, { indexer: fakeIndexer });
    const healedHealth = await inspectSearchIndexHealth(db);
    assertOk(healedHealth.healthy === true, 'repair should fix stale vectors and remove orphan vectors');
    assertOk(healedHealth.vectorsForCurrentProvider === 3, 'repair should leave one vector per searchable entity');

    await repairSearchIndexHealth(db, { indexer: fakeIndexer });
    const idempotentHealth = await inspectSearchIndexHealth(db);
    const allVectors = await db.searchvectors.find().exec();
    assertOk(idempotentHealth.healthy === true, 'second repair should keep health stable');
    assertOk(allVectors.length === 3, 'second repair should not duplicate vectors');

    console.log('Search index health repair guardrail passed.');
  } finally {
    resetEmbeddingProvider();
    await db.remove();
  }
}

await main();
