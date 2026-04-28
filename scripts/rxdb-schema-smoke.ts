import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import type { RyuCollections, RyuDatabase } from '../src/db/client';
import { collections, CURRENT_SCHEMA_VERSION } from '../src/db/runtime-schema';
import { findSearchDependentsForAuthor } from '../src/search/search-index-dependencies';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const now = '2026-01-01T00:00:00.000Z';
const authorId = 'https://books.example/author/ursula';
const otherAuthorId = 'https://books.example/author/octavia';
type RuntimeCollectionConfig = Parameters<RyuDatabase['addCollections']>[0];
const selectorCollections = { authors: collections.authors, works: collections.works, editions: collections.editions } as unknown as RuntimeCollectionConfig;

async function main(): Promise<void> {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const db = await createRxDatabase<RyuCollections>({ name: `ryu_schema_smoke_${Date.now()}`, storage: getRxStorageDexie(), multiInstance: false });

  try {
    await db.addCollections(selectorCollections);
    assert(db.works.schema.jsonSchema.version === CURRENT_SCHEMA_VERSION, 'works collection should initialize with runtime schema version');
    assert(db.editions.schema.jsonSchema.version === CURRENT_SCHEMA_VERSION, 'editions collection should initialize with runtime schema version');

    await db.authors.insert({ id: authorId, name: 'Ursula K. Le Guin', importedAt: now, updatedAt: now });
    await db.authors.insert({ id: otherAuthorId, name: 'Octavia E. Butler', importedAt: now, updatedAt: now });
    await db.works.insert({ id: 'https://books.example/work/dispossessed', title: 'The Dispossessed', summary: 'An ambiguous utopia.', authorIds: [authorId], importedAt: now, updatedAt: now });
    await db.works.insert({ id: 'https://books.example/work/kindred', title: 'Kindred', summary: 'A time-travel novel.', authorIds: [otherAuthorId], importedAt: now, updatedAt: now });
    await db.editions.insert({ id: 'https://books.example/edition/dispossessed-paperback', title: 'The Dispossessed', description: 'Paperback edition.', authorIds: [authorId], isbn13: '9780061054884', sourceUrl: 'https://books.example/edition/dispossessed-paperback', importedAt: now, updatedAt: now });
    await db.editions.insert({ id: 'https://books.example/edition/kindred-paperback', title: 'Kindred', description: 'Paperback edition.', authorIds: [otherAuthorId], sourceUrl: 'https://books.example/edition/kindred-paperback', importedAt: now, updatedAt: now });

    const membershipSelector = { authorIds: { $elemMatch: { $eq: authorId } } };
    const matchingWorks = await db.works.find({ selector: membershipSelector }).exec();
    const matchingEditions = await db.editions.find({ selector: membershipSelector }).exec();
    assert(matchingWorks.length === 1 && matchingWorks[0].id === 'https://books.example/work/dispossessed', 'authorIds selector should return the matching work');
    assert(matchingEditions.length === 1 && matchingEditions[0].id === 'https://books.example/edition/dispossessed-paperback', 'authorIds selector should return the matching edition');

    const dependentIds = (await findSearchDependentsForAuthor(db, authorId)).map((entity) => entity.id).sort();
    assert(dependentIds.length === 2, 'dependency lookup should return one work and one edition');
    assert(dependentIds.includes('https://books.example/work/dispossessed'), 'dependency lookup should include matching work');
    assert(dependentIds.includes('https://books.example/edition/dispossessed-paperback'), 'dependency lookup should include matching edition');
    assert(!dependentIds.includes('https://books.example/work/kindred'), 'dependency lookup should skip unrelated work');
    assert(!dependentIds.includes('https://books.example/edition/kindred-paperback'), 'dependency lookup should skip unrelated edition');

    console.log('RxDB schema selector smoke passed.');
  } finally {
    await db.remove();
  }
}

await main();
