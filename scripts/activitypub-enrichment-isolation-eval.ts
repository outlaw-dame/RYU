import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { createRxDBActivityPubStore, ingestActivityPubGraph } from '../src/db/activitypub-ingest';
import { createEntityEnrichmentScheduler } from '../src/db/entity-enrichment-scheduler';
import type { KnowledgeEntityCandidate } from '../src/db/entity-enrichment';
import type { RyuCollections, RyuDatabase } from '../src/db/client';
import { collections } from '../src/db/runtime-schema';
import { createSearchIndexQueue } from '../src/search/write-through-indexing';
import type { SearchDocument } from '../src/search/types';
import type { CanonicalApGraph } from '../src/sync/activitypub-client';

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

type RuntimeCollections = Parameters<RyuDatabase['addCollections']>[0];

const authorId = 'https://books.example/author/octavia';
const workId = 'https://books.example/work/kindred';
const editionId = 'https://books.example/edition/kindred';

const graph: CanonicalApGraph = {
  rootId: editionId,
  entities: [
    { kind: 'author', id: authorId, name: 'Octavia E. Butler' },
    { kind: 'work', id: workId, title: 'Kindred', authorIds: [authorId] },
    {
      kind: 'edition',
      id: editionId,
      title: 'Kindred',
      authorIds: [authorId],
      workId,
      sourceUrl: 'https://books.example/edition/kindred'
    }
  ]
};

const testCollections = {
  authors: collections.authors,
  works: collections.works,
  editions: collections.editions,
  entityresolutions: collections.entityresolutions,
  searchindexdependencies: collections.searchindexdependencies
} as unknown as RuntimeCollections;

async function verifyActiveEnrichmentDedupe(): Promise<void> {
  const calls: string[] = [];
  let release: (() => void) | null = null;
  const firstRunStarted = new Promise<void>((resolve) => {
    const scheduler = createEntityEnrichmentScheduler({
      concurrency: 1,
      maxSize: 20,
      enrich: async (candidate) => {
        calls.push(`${candidate.kind}:${candidate.id}`);
        resolve();
        await new Promise<void>((innerResolve) => {
          release = innerResolve;
        });
      },
      logger: { error: () => undefined, warn: () => undefined }
    });

    const candidate: KnowledgeEntityCandidate = { id: 'author:active-dedupe', kind: 'author', label: 'Active Dedupe' };
    scheduler.enqueue(candidate);

    void firstRunStarted.then(async () => {
      assertOk(scheduler.active() === 1, 'active dedupe scheduler should have one active job');
      scheduler.enqueue(candidate);
      assertOk(scheduler.pending() === 0, 'duplicate active enrichment job should not be queued');
      release?.();
      await scheduler.idle();
      assertOk(calls.length === 1, 'duplicate active enrichment job should be skipped');
    });
  });

  await firstRunStarted;
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function main(): Promise<void> {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  await verifyActiveEnrichmentDedupe();

  const db = await createRxDatabase<RyuCollections>({
    name: `ryu_ap_enrichment_isolation_${Date.now()}`,
    storage: getRxStorageDexie(),
    multiInstance: false
  });

  const indexed: SearchDocument[] = [];
  const enrichmentErrors: unknown[][] = [];
  const queue = createSearchIndexQueue({
    concurrency: 1,
    maxSize: 20,
    indexer: async (doc) => {
      indexed.push(doc);
    },
    logger: { error: () => undefined, warn: () => undefined }
  });
  const enrichmentScheduler = createEntityEnrichmentScheduler({
    concurrency: 1,
    maxSize: 20,
    enrich: async () => {
      throw new Error('intentional enrichment failure');
    },
    logger: {
      error: (...args: unknown[]) => {
        enrichmentErrors.push(args);
      },
      warn: () => undefined
    }
  });

  try {
    await db.addCollections(testCollections);
    const store = createRxDBActivityPubStore(db, {
      searchIndexQueue: queue,
      enrichmentScheduler
    });

    await ingestActivityPubGraph(graph, store);
    await queue.idle();
    await enrichmentScheduler.idle();

    const indexedIds = indexed.map((doc) => `${doc.type}:${doc.id}`).sort().join(',');
    assertOk(
      indexedIds === `author:${authorId},edition:${editionId},work:${workId}`,
      'ingestion should index author, work, and edition even when enrichment fails'
    );

    const dependencyRows = await db.searchindexdependencies.find({ selector: { authorId } }).exec();
    const dependencyIds = dependencyRows.map((row) => `${row.entityType}:${row.entityId}`).sort().join(',');
    assertOk(
      dependencyIds === `edition:${editionId},work:${workId}`,
      'ingestion should maintain dependency rows even when enrichment fails'
    );

    assertOk(enrichmentErrors.length === 3, 'enrichment failures should be logged for author, work, and edition');
    assertOk(enrichmentScheduler.pending() === 0, 'enrichment queue should drain after failures');
    assertOk(enrichmentScheduler.active() === 0, 'enrichment queue should not retain active jobs after failures');

    console.log('ActivityPub enrichment isolation guardrail passed.');
  } finally {
    await db.remove();
  }
}

await main();
