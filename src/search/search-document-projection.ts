import type { RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, ReviewDoc, WorkDoc } from '../db/schema';
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
    case 'review': {
      // Resolve the edition title for contextual enrichment.
      let editionTitle = '';
      if (entity.editionId) {
        try {
          const edition = await db.editions.findOne(entity.editionId).exec();
          if (edition) editionTitle = edition.title;
        } catch {
          // best effort
        }
      }
      const content = entity.content || '';
      const truncatedContent = content.length > 500 ? content.slice(0, 500) + '…' : content;
      return {
        id: entity.id,
        type: 'review',
        title: entity.title || (editionTitle ? `Review of ${editionTitle}` : 'Review'),
        description: truncatedContent,
        authorText: entity.accountId || '',
        isbnText: '',
        enrichmentText: editionTitle ? `Review of: ${editionTitle}` : '',
        source: 'local',
        scope: 'public',
        ownerId: entity.accountId || '',
        updatedAt: timestamp
      };
    }
    default:
      return null;
  }
}


/**
 * Project a ReviewDoc into a SearchDocument.
 *
 * Reviews are scoped to 'public' by default. Private reviews should have
 * their scope set by the indexing caller based on the review's visibility.
 *
 * The description combines the review content (truncated for embedding efficiency)
 * with the associated edition title for better semantic matching.
 */
export async function reviewDocToSearchDocument(
  db: RyuDatabase,
  review: ReviewDoc,
  editionTitleCache?: Map<string, string>
): Promise<SearchDocument> {
  // Resolve the edition title for context
  let editionTitle = "";
  const editionId = review?.editionId;
  if (editionId) {
    if (editionTitleCache?.has(editionId)) {
      editionTitle = editionTitleCache.get(editionId) || "";
    } else {
      try {
        const edition = await db.editions.findOne(editionId).exec();
        if (edition) {
          editionTitle = edition.title;
          editionTitleCache?.set(editionId, editionTitle);
        }
      } catch {
        // best effort
      }
    }
  }

  const content = review?.content || "";
  // Truncate content for embedding efficiency (first 500 chars)
  const truncatedContent = content.length > 500
    ? content.slice(0, 500) + "…"
    : content;

  return {
    id: review?.id || "",
    type: "review",
    title: review?.title || (editionTitle ? `Review of ${editionTitle}` : "Review"),
    description: truncatedContent,
    authorText: review?.accountId || "",
    isbnText: "",
    enrichmentText: editionTitle ? `Review of: ${editionTitle}` : "",
    source: "local",
    scope: "public",
    ownerId: review?.accountId || "",
    updatedAt: review?.updatedAt || ""
  };
}
