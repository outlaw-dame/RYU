import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { EditionDoc, SearchIndexDependencyDoc, SearchIndexDependencyEntityType, WorkDoc } from '../db/schema';
import { searchIndexDependencyId, upsertSearchIndexDependenciesForEntity } from './search-index-dependencies';

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
};

async function getDatabase(db?: RyuDatabase): Promise<RyuDatabase> {
  return db ?? initializeDatabase();
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function expectedRowsForEntity(
  entityType: SearchIndexDependencyEntityType,
  entityId: string,
  authorIds: string[]
): ExpectedDependency[] {
  return [...new Set(authorIds)].map((authorId) => ({
    id: searchIndexDependencyId(authorId, entityType, entityId),
    authorId,
    entityId,
    entityType
  }));
}

async function collectExpectedDependencies(db: RyuDatabase): Promise<Map<string, ExpectedDependency>> {
  const expected = new Map<string, ExpectedDependency>();

  const works = await db.works.find().exec();
  for (const work of works as WorkDoc[]) {
    for (const row of expectedRowsForEntity('work', work.id, work.authorIds)) expected.set(row.id, row);
  }

  const editions = await db.editions.find().exec();
  for (const edition of editions as EditionDoc[]) {
    for (const row of expectedRowsForEntity('edition', edition.id, edition.authorIds)) expected.set(row.id, row);
  }

  return expected;
}

function isStaleDependency(actual: SearchIndexDependencyDoc, expected: ExpectedDependency): boolean {
  return actual.authorId !== expected.authorId || actual.entityId !== expected.entityId || actual.entityType !== expected.entityType;
}

export async function inspectSearchIndexDependencyHealth(db?: RyuDatabase): Promise<SearchIndexDependencyHealth> {
  if (healthPromise) return healthPromise;

  healthPromise = (async () => {
    const database = await getDatabase(db);
    const expected = await collectExpectedDependencies(database);
    const actual = await database.searchindexdependencies.find().exec() as SearchIndexDependencyDoc[];
    const actualById = new Map(actual.map((row) => [row.id, row]));

    let missingDependencies = 0;
    let staleDependencies = 0;
    let orphanDependencies = 0;

    for (const [id, expectedRow] of expected) {
      const actualRow = actualById.get(id);
      if (!actualRow) {
        missingDependencies += 1;
        continue;
      }
      if (isStaleDependency(actualRow, expectedRow)) staleDependencies += 1;
    }

    for (const row of actual) {
      if (!expected.has(row.id)) orphanDependencies += 1;
    }

    return {
      expectedDependencies: expected.size,
      actualDependencies: actual.length,
      missingDependencies,
      staleDependencies,
      orphanDependencies,
      healthy: missingDependencies === 0 && staleDependencies === 0 && orphanDependencies === 0,
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

async function removeOrphanDependencies(db: RyuDatabase, expectedIds: Set<string>): Promise<void> {
  const actual = await db.searchindexdependencies.find().exec();
  for (const row of actual) {
    if (expectedIds.has(row.id)) continue;
    await row.remove().catch((error: unknown) => {
      console.error('Failed to remove orphan search dependency', {
        dependencyId: row.id,
        entityId: row.entityId,
        entityType: row.entityType,
        error
      });
    });
  }
}

export async function rebuildSearchIndexDependencies(db?: RyuDatabase): Promise<void> {
  if (rebuildPromise) return rebuildPromise;

  rebuildPromise = (async () => {
    const database = await getDatabase(db);
    const expectedIds = new Set<string>();
    const timestamp = new Date().toISOString();

    const works = await database.works.find().exec();
    for (let offset = 0; offset < works.length; offset += BACKFILL_BATCH_SIZE) {
      const batch = (works as WorkDoc[]).slice(offset, offset + BACKFILL_BATCH_SIZE);
      for (const work of batch) {
        for (const row of expectedRowsForEntity('work', work.id, work.authorIds)) expectedIds.add(row.id);
        await upsertSearchIndexDependenciesForEntity(database, 'work', work.id, work.authorIds, timestamp).catch((error: unknown) => {
          console.error('Failed to backfill work search dependencies', { entityId: work.id, error });
        });
      }
      await yieldToEventLoop();
    }

    const editions = await database.editions.find().exec();
    for (let offset = 0; offset < editions.length; offset += BACKFILL_BATCH_SIZE) {
      const batch = (editions as EditionDoc[]).slice(offset, offset + BACKFILL_BATCH_SIZE);
      for (const edition of batch) {
        for (const row of expectedRowsForEntity('edition', edition.id, edition.authorIds)) expectedIds.add(row.id);
        await upsertSearchIndexDependenciesForEntity(database, 'edition', edition.id, edition.authorIds, timestamp).catch((error: unknown) => {
          console.error('Failed to backfill edition search dependencies', { entityId: edition.id, error });
        });
      }
      await yieldToEventLoop();
    }

    await removeOrphanDependencies(database, expectedIds);
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
