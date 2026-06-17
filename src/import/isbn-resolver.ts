/**
 * Phase 26: ISBN-based import resolver.
 *
 * Resolves an ISBN to a structured edition entity by querying
 * OpenLibrary and Google Books APIs, then ingests the result
 * into the local RxDB database.
 */

import type { CanonicalApEntity, CanonicalApGraph } from '../sync/activitypub-client';

export type IsbnLookupResult = {
  title: string;
  subtitle?: string;
  description?: string;
  authors: Array<{ name: string; url?: string }>;
  isbn10?: string;
  isbn13?: string;
  coverUrl?: string;
  sourceUrl: string;
  source: 'openlibrary' | 'google_books';
};

type OpenLibraryEdition = {
  title?: string;
  subtitle?: string;
  description?: string | { value?: string };
  authors?: Array<{ key?: string }>;
  covers?: number[];
  isbn_10?: string[];
  isbn_13?: string[];
  key?: string;
};

type OpenLibraryAuthor = {
  name?: string;
  key?: string;
  bio?: string | { value?: string };
};

type GoogleBooksVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    description?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
      medium?: string;
      large?: string;
    };
    industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
    infoLink?: string;
  };
};

type GoogleBooksResponse = {
  items?: GoogleBooksVolume[];
};

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

function extractDescription(value: string | { value?: string } | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.value;
}

function generateEntityId(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

/**
 * Query OpenLibrary for an ISBN and return a structured result.
 */
async function queryOpenLibraryByIsbn(isbn: string, signal?: AbortSignal): Promise<IsbnLookupResult | null> {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return null;

  const url = `https://openlibrary.org/isbn/${encodeURIComponent(normalized)}.json`;

  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) return null;

  const edition: OpenLibraryEdition = await response.json();
  if (!edition.title) return null;

  // Resolve authors
  const authors: Array<{ name: string; url?: string }> = [];
  if (edition.authors && Array.isArray(edition.authors)) {
    for (const authorRef of edition.authors.slice(0, 5)) {
      if (!authorRef.key) continue;
      try {
        const authorUrl = `https://openlibrary.org${authorRef.key}.json`;
        const authorResp = await fetch(authorUrl, { signal, headers: { Accept: 'application/json' } });
        if (authorResp.ok) {
          const authorData: OpenLibraryAuthor = await authorResp.json();
          if (authorData.name) {
            authors.push({
              name: authorData.name,
              url: `https://openlibrary.org${authorRef.key}`
            });
          }
        }
      } catch {
        // Skip author on failure - edition import continues
      }
    }
  }

  const coverUrl = edition.covers?.[0]
    ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg`
    : undefined;

  return {
    title: edition.title,
    subtitle: edition.subtitle,
    description: extractDescription(edition.description),
    authors,
    isbn10: edition.isbn_10?.[0],
    isbn13: edition.isbn_13?.[0],
    coverUrl,
    sourceUrl: `https://openlibrary.org${edition.key || `/isbn/${normalized}`}`,
    source: 'openlibrary'
  };
}

/**
 * Query Google Books for an ISBN and return a structured result.
 */
async function queryGoogleBooksByIsbn(isbn: string, signal?: AbortSignal): Promise<IsbnLookupResult | null> {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return null;

  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(normalized)}&maxResults=1`;

  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) return null;

  const data: GoogleBooksResponse = await response.json();
  const volume = data.items?.[0];
  if (!volume?.volumeInfo?.title) return null;

  const info = volume.volumeInfo;
  const title = info.title!;
  const identifiers = info.industryIdentifiers ?? [];
  const isbn10 = identifiers.find((i) => i.type === 'ISBN_10')?.identifier;
  const isbn13 = identifiers.find((i) => i.type === 'ISBN_13')?.identifier;

  const coverUrl = info.imageLinks?.large
    ?? info.imageLinks?.medium
    ?? info.imageLinks?.thumbnail
    ?? info.imageLinks?.smallThumbnail;

  // Normalize cover URL to HTTPS
  const safeCoverUrl = coverUrl?.replace(/^http:/, 'https:');

  return {
    title,
    subtitle: info.subtitle ?? undefined,
    description: info.description ?? undefined,
    authors: (info.authors ?? []).map((name) => ({ name })),
    isbn10,
    isbn13,
    coverUrl: safeCoverUrl,
    sourceUrl: info.infoLink ?? `https://books.google.com/books?id=${volume.id}`,
    source: 'google_books' as const
  };
}

/**
 * Resolve an ISBN to a book entity. Tries OpenLibrary first, then Google Books.
 */
export async function resolveIsbn(isbn: string, signal?: AbortSignal): Promise<IsbnLookupResult | null> {
  // Try OpenLibrary first (richer data, covers)
  const olResult = await queryOpenLibraryByIsbn(isbn, signal).catch(() => null);
  if (olResult) return olResult;

  // Fallback to Google Books
  const gbResult = await queryGoogleBooksByIsbn(isbn, signal).catch(() => null);
  if (gbResult) return gbResult;

  return null;
}

/**
 * Convert an ISBN lookup result into a CanonicalApGraph for ingestion
 * into the existing ActivityPub ingest pipeline.
 */
export function isbnResultToApGraph(result: IsbnLookupResult, isbn: string): CanonicalApGraph {
  const normalized = normalizeIsbn(isbn);
  const editionId = generateEntityId('isbn', normalized);
  const entities: CanonicalApEntity[] = [];
  const authorIds: string[] = [];

  // Create author entities
  for (const author of result.authors) {
    const authorId = generateEntityId('isbn-author', `${normalized}:${author.name.toLowerCase().replace(/\s+/g, '-')}`);
    authorIds.push(authorId);
    entities.push({
      kind: 'author',
      id: authorId,
      name: author.name,
      url: author.url,
      summary: undefined
    });
  }

  // Create edition entity
  entities.push({
    kind: 'edition',
    id: editionId,
    title: result.title,
    subtitle: result.subtitle,
    description: result.description,
    authorIds,
    workId: undefined,
    coverUrl: result.coverUrl,
    isbn10: result.isbn10,
    isbn13: result.isbn13,
    sourceUrl: result.sourceUrl
  });

  return {
    rootId: editionId,
    entities
  };
}
