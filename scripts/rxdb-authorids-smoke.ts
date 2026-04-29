import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import type { RyuCollections, RyuDatabase } from '../src/db/client';
import { collections, CURRENT_SCHEMA_VERSION } from '../src/db/runtime-schema';
import {
  findSearchDependentsForAuthor,
  searchIndexDependencyId,
  upsertSearchIndexDependenciesForEntity
} from '../src/search/search-index-dependencies';
import {
  inspectSearchIndexDependencyHealth,
  rebuildSearchIndexDependencies
} from '../src/search/search-index-dependency-lifecycle';

const now = '2026-01-01T00:00:00.000Z';
const authorId = 'author:ursula';
const otherAuthorId = 'author:octavia';
type RuntimeCollections = Parameters<RyuDatabase['addCollections']>[0];

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  addRxPlugin(RxDBMigrationSchemaPlugin);

  const db = await createRxDatabase<RyuCollections>({
    name: `ryu_schema_smoke_${Date.now()}`,
    storage: getRxStorageDexie(),
    multiInstance: false
  });

  try {
    const dbCollections = {
      authors: collections.authors,
      works: collections.works,
      editions: collections.editions,
      searchindexdependencies: collections.searchindexdependencies
    } as unknown as RuntimeCollections;

    await db.addCollections(dbCollections);

    assertOk(db.works.schema.jsonSchema.version === CURRENT_SCHEMA_VERSION, 'works should use runtime schema version');
    assertOk(db.editions.schema.jsonSchema.version === CURRENT_SCHEMA_VERSION, 'editions should use runtime schema version');
    assertOk(db.searchindexdependencies.schema.jsonSchema.version === CURRENT_SCHEMA_VERSION, 'search dependency index should use runtime schema version');

    await db.authors.bulkInsert([
      { id: authorId, name: 'Ursula K. Le Guin', importedAt: now, updatedAt: now },
      { id: otherAuthorId, name: 'Octavia E. Butler', importedAt: now, updatedAt: now }
    ]);

    await db.works.bulkInsert([
      { id: 'work:dispossessed', title: 'The Dispossessed', authorIds: [authorId], importedAt: now, updatedAt: now },
      { id: 'work:kindred', title: 'Kindred', authorIds: [otherAuthorId], importedAt: now, updatedAt: now }
    ]);

    await db.editions.bulkInsert([
      { id: 'edition:dispossessed', title: 'The Dispossessed', authorIds: [authorId], sourceUrl: 'https://books.example/dispossessed', importedAt: now, updatedAt: now },
      { id: 'edition:kindred', title: 'Kindred', authorIds: [otherAuthorId], sourceUrl: 'https://books.example/kindred', importedAt: now, updatedAt: now }
    ]);

    const initialHealth = await inspectSearchIndexDependencyHealth(db);
    assertOk(initialHealth.missingDependencies === 4, 'dependency health should detect missing rows for existing works and editions');
    assertOk(initialHealth.healthy === false, 'dependency health should report unhealthy when rows are missing');

    await rebuildSearchIndexDependencies(db);

    const rebuiltHealth = await inspectSearchIndexDependencyHealth(db);
    assertOk(rebuiltHealth.healthy === true, 'dependency backfill should repair missing rows');
    assertOk(rebuiltHealth.expectedDependencies === 4, 'dependency backfill should expect four rows');
    assertOk(rebuiltHealth.actualDependencies === 4, 'dependency backfill should create four rows');

    const dependencyRows = await db.searchindexdependencies.find({ selector: { authorId } }).exec();
    assertOk(dependencyRows.length === 2, 'dependency index should contain exactly two rows for the target author after backfill');

    const dependents = await findSearchDependentsForAuthor(db, authorId);
    const ids = dependents.map((entity) => entity.id).sort().join(',');
    assertOk(ids === 'edition:dispossessed,work:dispossessed', 'dependency lookup should return only matching records after backfill');

    await upsertSearchIndexDependenciesForEntity(db, 'work', 'work:dispossessed', [otherAuthorId], now);
    const staleRows = await db.searchindexdependencies.find({ selector: { authorId } }).exec();
    assertOk(staleRows.length === 1, 'dependency index should remove stale author links for updated entities');

    await db.searchindexdependencies.upsert({
      id: searchIndexDependencyId(authorId, 'work', 'work:missing'),
      authorId,
      entityId: 'work:missing',
      entityType: 'work',
      updatedAt: now
    });

    const orphanHealth = await inspectSearchIndexDependencyHealth(db);
    assertOk(orphanHealth.orphanDependencies >= 1, 'dependency health should detect orphan rows');

    await rebuildSearchIndexDependencies(db);
    const healedHealth = await inspectSearchIndexDependencyHealth(db);
    assertOk(healedHealth.healthy === true, 'dependency rebuild should remove orphan rows');

    console.log('RxDB normalized search dependency smoke passed.');
  } finally {
    await db.remove();
  }
}

await main();
