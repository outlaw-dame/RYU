import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { createRxDBActivityPubStore, ingestActivityPubGraph } from '../src/db/activitypub-ingest';
import { createEntityEnrichmentScheduler } from '../src/db/entity-enrichment-scheduler';
import type { RyuCollections, RyuDatabase } from '../src/db/client';
import { collections } from '../src/db/runtime-schema';
import { registerEmbeddingProvider, resetEmbeddingProvider } from '../src/search/embedding-provider';
import { searchAll } from '../src/search/search';
import type { RankedSearchResult } from '../src/search/types';
import { createSearchIndexQueue } from '../src/search/write-through-indexing';
import type { CanonicalApGraph } from '../src/sync/activitypub-client';

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

type RuntimeCollections = Parameters<RyuDatabase['addCollections']>[0];

const model = 'activitypub-import-search-eval';
const dimensions = 4;
const authorId = 'https://books.example/author/ursula';
const workId = 'https://books.example/work/dispossessed';
const editionId = 'https://books.example/edition/dispossessed';
const isbn13 = '9780061054884';

const graph: CanonicalApGraph = {
  rootId: editionId,
  entities: [
    {
      kind: 'edition',
      id: editionId,
      title: 'The Dispossessed',
      subtitle: 'An Ambiguous Utopia',
      description: 'Paperback edition with ambiguous utopia themes.',
      authorIds: [authorId],
      workId,
      isbn13,
      sourceUrl: 'https://books.example/edition/dispossessed'
    },
    {
      kind: 'work',
      id: workId,
      title: 'The Dispossessed',
      summary: 'A classic novel with ambiguous utopia themes.',
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

const evalCollections = {
  authors: collections.authors,
  works: collections.works,
  editions: collections.editions,
  entityresolutions: collections.entityresolutions,
  searchindexdependencies: collections.searchindexdependencies,
  searchvectors: collections.searchvectors
} as unknown as RuntimeCollections;

function embed(text: string): number[] {
  const normalized = text.toLowerCase();
  const checksum = Array.from(normalized).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return [
    checksum % 101,
    normalized.length % 101,
    normalized.includes('ambiguous') ? 10 : 0,
    normalized.includes('utopia') ? 10 : 0
  ];
}

function hasResult(results: RankedSearchResult[], id: string): boolean {
  return results.some((result) => result.id === id);
}

async function assertSearch(db: RyuDatabase, query: string, expectedId: string, message: string): Promise<void> {
  const grouped = await searchAll(query, { db, context: { surface: 'global' } });
  assertOk(Boolean(grouped), `${message}: expected grouped results`);
  assertOk(hasResult(grouped!.all, expectedId), `${message}: expected ${expectedId}`);
}

async function main(): Promise<void> {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  registerEmbeddingProvider({ id: model, dimensions, embed });

  const db = await createRxDatabase<RyuCollections>({
    name: `ryu_ap_import_search_${Date.now()}`,
    storage: getRxStorageDexie(),
    multiInstance: false
  });

  const searchIndexQueue = createSearchIndexQueue({ concurrency: 1, maxSize: 20 });
  const enrichmentScheduler = createEntityEnrichmentScheduler({
    enrich: async () => undefined,
    logger: { error: () => undefined, warn: () => undefined }
  });

  try {
    await db.addCollections(evalCollections);
    const store = createRxDBActivityPubStore(db, { searchIndexQueue, enrichmentScheduler });

    await ingestActivityPubGraph(graph, store);
    await searchIndexQueue.idle();
    await enrichmentScheduler.idle();

    await assertSearch(db, 'The Dispossessed', editionId, 'title search should find imported edition');
    await assertSearch(db, 'The Dispossessed', workId, 'title search should find imported work');
    await assertSearch(db, 'Ursula Le Guin', authorId, 'author search should find imported author');
    await assertSearch(db, 'Ursula Le Guin', workId, 'author search should find authored work');
    await assertSearch(db, isbn13, editionId, 'ISBN search should find imported edition');
    await assertSearch(db, 'ambiguous utopia', workId, 'semantic query should find imported work');

    console.log('ActivityPub import-to-search guardrail passed.');
  } finally {
    resetEmbeddingProvider();
    await db.remove();
  }
}

await main();
