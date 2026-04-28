import type { RyuDatabase } from '../db/client';
import type { EditionDoc, SearchIndexDependencyEntityType, WorkDoc } from '../db/schema';
import type { CanonicalApEntity } from '../sync/activitypub-client';
import { hashText } from './vector-utils';
import { importedSearchIndexQueue, type SearchIndexQueue } from './write-through-indexing';

export type SearchIndexDependencyLogger = Pick<Console, 'error'>;

function dependencyId(authorId: string, entityType: SearchIndexDependencyEntityType, entityId: string): string {
  return `${entityType}:${hashText(authorId)}:${hashText(entityId)}`;
}

function workDocToCanonicalEntity(work: WorkDoc): Extract<CanonicalApEntity, { kind: 'work' }> {
  return {
    kind: 'work',
    id: work.id,
    title: work.title,
    summary: work.summary,
    authorIds: work.authorIds,
    url: work.url
  };
}

function editionDocToCanonicalEntity(edition: EditionDoc): Extract<CanonicalApEntity, { kind: 'edition' }> {
  return {
    kind: 'edition',
    id: edition.id,
    title: edition.title,
    subtitle: edition.subtitle,
    description: edition.description,
    authorIds: edition.authorIds,
    workId: edition.workId,
    coverUrl: edition.coverUrl,
    isbn10: edition.isbn10,
    isbn13: edition.isbn13,
    sourceUrl: edition.sourceUrl
  };
}

export async function upsertSearchIndexDependenciesForEntity(
  db: RyuDatabase,
  entityType: SearchIndexDependencyEntityType,
  entityId: string,
  authorIds: string[],
  updatedAt: string
): Promise<void> {
  const uniqueAuthorIds = [...new Set(authorIds)];
  const nextIds = new Set(uniqueAuthorIds.map((authorId) => dependencyId(authorId, entityType, entityId)));

  const existing = await db.searchindexdependencies
    .find({ selector: { entityId, entityType } })
    .exec();

  await Promise.all(existing.map(async (doc) => {
    if (!nextIds.has(doc.id)) await doc.remove();
  }));

  await Promise.all(uniqueAuthorIds.map((authorId) => db.searchindexdependencies.upsert({
    id: dependencyId(authorId, entityType, entityId),
    authorId,
    entityId,
    entityType,
    updatedAt
  })));
}

async function resolveDependencyEntity(db: RyuDatabase, entityType: SearchIndexDependencyEntityType, entityId: string): Promise<CanonicalApEntity | null> {
  if (entityType === 'work') {
    const work = await db.works.findOne(entityId).exec();
    return work ? workDocToCanonicalEntity(work as WorkDoc) : null;
  }

  const edition = await db.editions.findOne(entityId).exec();
  return edition ? editionDocToCanonicalEntity(edition as EditionDoc) : null;
}

export async function findSearchDependentsForAuthor(
  db: RyuDatabase,
  authorId: string
): Promise<CanonicalApEntity[]> {
  const dependencies = await db.searchindexdependencies
    .find({ selector: { authorId } })
    .exec();

  const seen = new Set<string>();
  const dependents: CanonicalApEntity[] = [];

  for (const dependency of dependencies) {
    const key = `${dependency.entityType}:${dependency.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entity = await resolveDependencyEntity(db, dependency.entityType, dependency.entityId);
    if (entity) {
      dependents.push(entity);
      continue;
    }

    await dependency.remove().catch((error: unknown) => {
      console.error('Failed to remove stale search dependency', {
        dependencyId: dependency.id,
        entityId: dependency.entityId,
        entityType: dependency.entityType,
        error
      });
    });
  }

  return dependents;
}

export function enqueueAuthorSearchDependents(
  db: RyuDatabase,
  authorId: string,
  timestamp: string,
  queue: SearchIndexQueue = importedSearchIndexQueue,
  logger: SearchIndexDependencyLogger = console
): void {
  void findSearchDependentsForAuthor(db, authorId)
    .then((entities) => {
      for (const entity of entities) {
        queue.enqueue(db, entity, timestamp);
      }
    })
    .catch((error) => {
      logger.error('Failed to enqueue dependent search reindex jobs', {
        authorId,
        error
      });
    });
}
