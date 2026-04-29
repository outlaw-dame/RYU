import type { RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, WorkDoc } from '../db/schema';
import type { CanonicalApEntity } from '../sync/activitypub-client';
import type { SearchDocument } from './types';

export type SearchProjectionSource = 'local' | 'remote';

export async function resolveAuthorNames(db: RyuDatabase, authorIds: string[]): Promise<string> {
  if (authorIds.length === 0) return '';

  const uniqueIds = [...new Set(authorIds)];
  const names = await Promise.all(uniqueIds.map(async (id) => {
    const author = await db.authors.findOne(id).exec().catch(() => null);
    return author?.name || id;
  }));

  return names.join(' ');
}

export function authorDocToSearchDocument(author: AuthorDoc): SearchDocument {
  return {
    id: author.id,
    type: 'author',
    title: author.name,
    description: author.summary || '',
    authorText: author.name,
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    updatedAt: author.updatedAt
  };
}

export async function workDocToSearchDocument(db: RyuDatabase, work: WorkDoc): Promise<SearchDocument> {
  return {
    id: work.id,
    type: 'work',
    title: work.title,
    description: work.summary || '',
    authorText: await resolveAuthorNames(db, work.authorIds),
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    updatedAt: work.updatedAt
  };
}

export async function editionDocToSearchDocument(db: RyuDatabase, edition: EditionDoc): Promise<SearchDocument> {
  return {
    id: edition.id,
    type: 'edition',
    title: edition.title,
    description: edition.description || '',
    authorText: await resolveAuthorNames(db, edition.authorIds),
    isbnText: `${edition.isbn10 || ''} ${edition.isbn13 || ''}`.trim(),
    enrichmentText: edition.subtitle || '',
    source: 'local',
    updatedAt: edition.updatedAt
  };
}

export async function canonicalEntityToSearchDocument(
  db: RyuDatabase,
  entity: CanonicalApEntity,
  timestamp: string
): Promise<SearchDocument | null> {
  switch (entity.kind) {
    case 'author':
      return {
        id: entity.id,
        type: 'author',
        title: entity.name,
        description: entity.summary || '',
        authorText: entity.name,
        isbnText: '',
        enrichmentText: '',
        source: 'local',
        updatedAt: timestamp
      };
    case 'work':
      return {
        id: entity.id,
        type: 'work',
        title: entity.title,
        description: entity.summary || '',
        authorText: await resolveAuthorNames(db, entity.authorIds),
        isbnText: '',
        enrichmentText: '',
        source: 'local',
        updatedAt: timestamp
      };
    case 'edition':
      return {
        id: entity.id,
        type: 'edition',
        title: entity.title,
        description: entity.description || '',
        authorText: await resolveAuthorNames(db, entity.authorIds),
        isbnText: `${entity.isbn10 || ''} ${entity.isbn13 || ''}`.trim(),
        enrichmentText: entity.subtitle || '',
        source: 'local',
        updatedAt: timestamp
      };
    default:
      return null;
  }
}
