import type { RyuDatabase } from '../db/client';

export type SearchEntityType = 'edition' | 'work' | 'author';

/**
 * Source provenance for a SearchDocument.
 * Indicates where the indexed data originally came from.
 */
export type SearchDocumentSource =
  | 'local'
  | 'activitypub'
  | 'bookwyrm'
  | 'openlibrary'
  | 'google_books'
  | 'wikidata';

/**
 * Visibility scope for a SearchDocument.
 * Controls which search surfaces can include this document.
 *
 * - public: visible in all surfaces including global/explore
 * - followers: visible to followed accounts (federated context)
 * - private: visible only to the owning user's library surface
 * - local-only: visible only on-device, never leaves the app boundary
 * - cache-only: remote content cached for display, not searchable by default
 */
export type SearchDocumentScope =
  | 'public'
  | 'followers'
  | 'private'
  | 'local-only'
  | 'cache-only';

export type SearchSurface = 'global' | 'library' | 'shelf' | 'onboarding' | 'entity';

export type SearchContext = {
  surface?: SearchSurface;
  activeShelfId?: string;
  entityTypeHint?: SearchEntityType;
  preferOwnedLibrary?: boolean;
};

export type SearchDocument = {
  id: string;
  type: SearchEntityType;
  title: string;
  description: string;
  authorText: string;
  isbnText: string;
  enrichmentText: string;
  source: SearchDocumentSource;
  /** Visibility scope — determines which surfaces can include this document. Defaults to 'public'. */
  scope?: SearchDocumentScope;
  /** Owner user ID — required for private/local-only documents to enforce access. */
  ownerId?: string;
  /** Instance host for federated content (e.g. "bookwyrm.social"). */
  instanceHost?: string;
  /** Canonical URI for remote content (ActivityPub id, OpenLibrary key, etc.). */
  canonicalUri?: string;
  updatedAt: string;
};

export type RankedSearchResult = SearchDocument & {
  score: number;
  lexicalScore?: number;
  semanticScore?: number;
  reasons?: string[];
};

export type SearchOptions = {
  limit?: number;
  alpha?: number;
  context?: SearchContext;
  db?: RyuDatabase;
};

export type SemanticSearchProvider = {
  search(query: string, options?: SearchOptions): Promise<RankedSearchResult[]>;
};
