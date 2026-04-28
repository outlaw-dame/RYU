import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { EditionDoc, SearchIndexDependencyDoc, SearchIndexDependencyEntityType, WorkDoc } from '../db/schema';
import { searchIndexDependencyId } from './search-index-dependencies';

const BACKFILL_BATCH_SIZE = 50;
const DEPENDENCY_HEALTH_STARTUP_DELAY_MS = 6_000;
let rebuildPromise: Promise<void> | null = null;
let healthPromise: Promise<SearchIndexDependencyHealth> | null = null;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

export type SearchIndexDependencyHealth = {
  expectedDependencies: number;
  actualDependencies: number;
  missingDependencies: number;
  staleDependencies: number;
  orphanDependencies: number;
  healthy: boolean;
  checkedAt: string;
};

type ExpectedDependency = {
  id: string;
  authorId: string;
  entityId: string;
  entityType: SearchIndexDependencyEntityType;
  updatedAt: string;
};

type DependencySource = Pick<WorkDoc | EditionDoc, 'id' | 'authorIds' | 'updatedAt'>;

type DependencyCollection = typeof import('../db/client').RyuDatabase.prototype.searchindexdependencies;

async function getDatabase(db?: RyuDatabase): Promise<RyuDatabase> {
  return db ?? initializeDatabase();
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function expectedRowsForEntity(
  entityType: SearchIndexDependencyEntityType,
  entityId: string,
  authorIds: string[],
  updatedAt: string
): ExpectedDependency[] {
  return [...new Set(authorIds)].map((authorId) => ({
    id: searchIndexDependencyId(authorId, entityType, entityId),
    authorId,
    entityId,
    entityType,
    updatedAt
  }));
}

async function findBatch<T>(collection: { find: (query: unknown) => { exec: () => Promise<T[]> } }, offset: number): Promise<T[]> {
  return collection.find({ selector: {}, skip: offset, limit: BACKFILL_BATCH_SIZE }).exec();
}

async function* iterateCollection<T>(collection: { find: (query: unknown) => { exec: () => Promise<T[]> } }): AsyncGenerator<T[]> {
  for (let offset = 0; ; offset += BACKFILL_BATCH_SIZE) {
    const batch = await findBatch<T>(collection, offset);
    if (batch.length === 0) return;
    yield batch;
    if (batch.length < BACKFILL_BATCH_SIZE) return;
    await yieldToEventLoop();
  }
}

async function findDependenciesForEntities(
  db: RyuDatabase,
  entityType: SearchIndexDependencyEntityType,
  entityIds: string[]
): Promise<SearchIndexDependencyDoc[]> {
  if (entityIds.length === 0) return [];
  return db.searchindexdependencies
    .find({ selector: { entityType, entityId: { $in: entityIds } } as never })
    .exec() as Promise<SearchIndexDependencyDoc[]>;
}

function diffEntityDependencies(expected: ExpectedDependency[], actual: SearchIndexDependencyDoc[]) {
  const expectedById = new Map(expected.map((row) => [row.id, row]));
  const actualById = new Map(actual.map((row) => [row.id, row]));
  let missing = 0;
  let stale = 0;

  for (const [id, expectedRow] of expectedById) {
    const actualRow = actualById.get(id);
    if (!actualRow) {
      missing += 1;
      continue;
    }
    if (
      actualRow.authorId !== expectedRow.authorId ||
      actualRow.entityId !== expectedRow.entityId ||
      actualRow.entityType !== expectedRow.entityType
    ) {
      stale += 1;
    }
  }

  for (const actualRow of actual) {
    if (!expectedById.has(actualRow.id)) stale += 1;
  }

  return { missing, stale };
}

async function inspectSourceDependencies(
  db: RyuDatabase,
  entityType: SearchIndexDependencyEntityType,
  sources: DependencySource[]
): Promise<{ expected: number; missing: number; stale: number }> {
  const expected = sources.flatMap((source) => expectedRowsForEntity(entityType, source.id, source.authorIds, source.updatedAt));
  const actual = await findDependenciesForEntities(db, entityType, sources.map((source) => source.id));
  const diff = diffEntityDependencies(expected, actual);
  return { expected: expected.length, missing: diff.missing, stale: diff.stale };
}

async function dependencyEntityExists(db: RyuDatabase, row: SearchIndexDependencyDoc): Promise<boolean> {
  if (row.entityType === 'work') {
    const work = await db.works.findOne(row.entityId).exec();
    return Boolean(work && (work as WorkDoc).authorIds.includes(row.authorId));
  }

  const edition = await db.editions.findOne(row.entityId).exec();
  return Boolean(edition && (edition as EditionDoc).authorIds.includes(row.authorId));
}

async function inspectOrphanDependencies(db: RyuDatabase): Promise<{ actual: number; orphan: number }> {
  let actual = 0;
  let orphan = 0;

  for await (const batch of iterateCollection<SearchIndexDependencyDoc>(db.searchindexdependencies as never)) {
    actual += batch.length;
    for (const row of batch) {
      const expectedId = searchIndexDependencyId(row.authorId, row.entityType, row.entityId);
      if (row.id !== expectedId || !(await dependencyEntityExists(db, row))) orphan += 1;
    }
  }

  return { actual, orphan };
}

export async function inspectSearchIndexDependencyHealth(db?: RyuDatabase): Promise<SearchIndexDependencyHealth> {
  if (healthPromise) return healthPromise;

  healthPromise = (async () => {
    const database = await getDatabase(db);
    let expectedDependencies = 0;
    let missingDependencies = 0;
    let staleDependencies = 0;

    for await (const batch of iterateCollection<WorkDoc>(database.works as never)) {
      const result = await inspectSourceDependencies(database, 'work', batch);
      expectedDependencies += result.expected;
      missingDependencies += result.missing;
      staleDependencies += result.stale;
    }

    for await (const batch of iterateCollection<EditionDoc>(database.editions as never)) {
      const result = await inspectSourceDependencies(database, 'edition', batch);
      expectedDependencies += result.expected;
      missingDependencies += result.missing;
      staleDependencies += result.stale;
    }

    const { actual, orphan } = await inspectOrphanDependencies(database);

    return {
      expectedDependencies,
      actualDependencies: actual,
      missingDependencies,
      staleDependencies,
      orphanDependencies: orphan,
      healthy: missingDependencies === 0 && staleDependencies === 0 && orphan === 0,
      checkedAt: new Date().toISOString()
    };
  })().catch((error) => {
    console.error('Search dependency index health check failed', { error });
    throw error;
  }).finally(() => {
    healthPromise = null;
  });

  return healthPromise;
}

async function bulkUpsertDependencies(db: RyuDatabase, rows: ExpectedDependency[]): Promise<void> {
  if (rows.length === 0) return;
  const collection = db.searchindexdependencies as unknown as {
    bulkUpsert?: (docs: ExpectedDependency[]) => Promise<unknown>;
    upsert: (doc: ExpectedDependency) => Promise<unknown>;
  };

  if (typeof collection.bulkUpsert === 'function') {
    await collection.bulkUpsert(rows);
    return;
  }

  await Promise.all(rows.map((row) => collection.upsert(row)));
}

async function bulkRemoveDependencies(db: RyuDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const collection = db.searchindexdependencies as unknown as {
    bulkRemove?: (ids: string[]) => Promise<unknown>;
    findOne: (id: string) => { exec: () => Promise<{ remove: () => Promise<unknown> } | null> };
  };

  if (typeof collection.bulkRemove === 'function') {
    await collection.bulkRemove(ids);
    return;
  }

  await Promise.all(ids.map(async (id) => {
    const row = await collection.findOne(id).exec();
    if (row) await row.remove();
  }));
}

async function backfillSourceBatch(
  db: RyuDatabase,
  entityType: SearchIndexDependencyEntityType,
  sources: DependencySource[]
): Promise<void> {
  const expected = sources.flatMap((source) => expectedRowsForEntity(entityType, source.id, source.authorIds, source.updatedAt));
  const actual = await findDependenciesForEntities(db, entityType, sources.map((source) => source.id));
  const expectedIds = new Set(expected.map((row) => row.id));
  const staleIds = actual.filter((row) => !expectedIds.has(row.id)).map((row) => row.id);

  await bulkRemoveDependencies(db, staleIds).catch((error: unknown) => {
    console.error('Failed to remove stale search dependencies', { entityType, error });
  });

  await bulkUpsertDependencies(db, expected).catch((error: unknown) => {
    console.error('Failed to upsert search dependencies', { entityType, error });
  });
}

async function removeOrphanDependencies(db: RyuDatabase): Promise<void> {
  const orphanIds: string[] = [];

  for await (const batch of iterateCollection<SearchIndexDependencyDoc>(db.searchindexdependencies as never)) {
    for (const row of batch) {
      const expectedId = searchIndexDependencyId(row.authorId, row.entityType, row.entityId);
      if (row.id !== expectedId || !(await dependencyEntityExists(db, row))) orphanIds.push(row.id);
    }
  }

  for (let offset = 0; offset < orphanIds.length; offset += BACKFILL_BATCH_SIZE) {
    await bulkRemoveDependencies(db, orphanIds.slice(offset, offset + BACKFILL_BATCH_SIZE)).catch((error: unknown) => {
      console.error('Failed to bulk remove orphan search dependencies', { error });
    });
    await yieldToEventLoop();
  }
}

export async function rebuildSearchIndexDependencies(db?: RyuDatabase): Promise<void> {
  if (rebuildPromise) return rebuildPromise;

  rebuildPromise = (async () => {
    const database = await getDatabase(db);

    for await (const batch of iterateCollection<WorkDoc>(database.works as never)) {
      await backfillSourceBatch(database, 'work', batch);
      await yieldToEventLoop();
    }

    for await (const batch of iterateCollection<EditionDoc>(database.editions as never)) {
      await backfillSourceBatch(database, 'edition', batch);
      await yieldToEventLoop();
    }

    await removeOrphanDependencies(database);
  })().catch((error) => {
    console.error('Search dependency index rebuild failed', { error });
    throw error;
  }).finally(() => {
    rebuildPromise = null;
  });

  return rebuildPromise;
}

export async function healSearchIndexDependenciesIfNeeded(db?: RyuDatabase): Promise<SearchIndexDependencyHealth> {
  const database = await getDatabase(db);
  const health = await inspectSearchIndexDependencyHealth(database);
  if (!health.healthy) {
    console.info('Search dependency index health check scheduled rebuild', health);
    scheduleSearchIndexDependencyBackfill(database);
  }
  return health;
}

export function scheduleSearchIndexDependencyBackfill(db?: RyuDatabase): void {
  const run = () => {
    rebuildSearchIndexDependencies(db).catch((error) => {
      console.error('Scheduled search dependency index rebuild failed', { error });
    });
  };

  if (typeof window === 'undefined') {
    run();
    return;
  }

  window.setTimeout(() => {
    const browserWindow = window as WindowWithIdleCallback;
    if (typeof browserWindow.requestIdleCallback === 'function') {
      browserWindow.requestIdleCallback(run, { timeout: DEPENDENCY_HEALTH_STARTUP_DELAY_MS });
      return;
    }
    run();
  }, DEPENDENCY_HEALTH_STARTUP_DELAY_MS);
}

export function scheduleSearchIndexDependencyHealthCheck(): void {
  const run = () => {
    healSearchIndexDependenciesIfNeeded().catch((error) => {
      console.error('Scheduled search dependency index health check failed', { error });
    });
  };

  if (typeof window === 'undefined') {
    run();
    return;
  }

  window.setTimeout(() => {
    const browserWindow = window as WindowWithIdleCallback;
    if (typeof browserWindow.requestIdleCallback === 'function') {
      browserWindow.requestIdleCallback(run, { timeout: DEPENDENCY_HEALTH_STARTUP_DELAY_MS });
      return;
    }
    run();
  }, DEPENDENCY_HEALTH_STARTUP_DELAY_MS);
}
