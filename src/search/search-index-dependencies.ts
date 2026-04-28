import type { RyuDatabase } from '../db/client';
import type { EditionDoc, WorkDoc } from '../db/schema';
import type { CanonicalApEntity } from '../sync/activitypub-client';
import { importedSearchIndexQueue, type SearchIndexQueue } from './write-through-indexing';

export type SearchIndexDependencyLogger = Pick<Console, 'error'>;

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

export async function findSearchDependentsForAuthor(
  db: RyuDatabase,
  authorId: string
): Promise<CanonicalApEntity[]> {
  const [works, editions] = await Promise.all([
    db.works.find().exec(),
    db.editions.find().exec()
  ]);

  const dependentWorks = (works as WorkDoc[])
    .filter((work) => work.authorIds.includes(authorId))
    .map(workDocToCanonicalEntity);

  const dependentEditions = (editions as EditionDoc[])
    .filter((edition) => edition.authorIds.includes(authorId))
    .map(editionDocToCanonicalEntity);

  return [...dependentWorks, ...dependentEditions];
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
