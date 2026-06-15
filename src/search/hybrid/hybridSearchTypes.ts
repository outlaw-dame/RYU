/**
 * Core types for the local hybrid search engine boundary.
 *
 * These types define the stable abstraction that app code depends on.
 * Implementation details (RxDB, Orama, vector maps) stay behind the engine adapter.
 */

import type { RyuDatabase } from "../../db/client";
import type { RankedSearchResult, SearchContext, SearchDocument, SearchOptions } from "../types";
import type { GroupedSearchResults } from "../group";
import type { SearchIndexHealth } from "../index-lifecycle";

/**
 * Query input for the hybrid search engine.
 */
export type HybridSearchQuery = {
  query: string;
  limit?: number;
  db?: RyuDatabase;
  options?: SearchOptions;
};

/**
 * Diagnostics returned with every search response.
 * Makes search quality measurable without exposing internals.
 */
export type HybridSearchDiagnostics = {
  lexicalCount: number;
  semanticCount: number;
  fusedCount: number;
  finalCount: number;
  providerId: string;
  providerDimensions: number;
  usedSemantic: boolean;
  repairedBeforeSearch: boolean;
  durationMs: number;
};

/**
 * Full response from a hybrid search query.
 */
export type HybridSearchResponse = {
  query: string;
  normalizedQuery: string;
  results: GroupedSearchResults<RankedSearchResult> | null;
  diagnostics: HybridSearchDiagnostics;
};

/**
 * Stable interface for any local hybrid search engine implementation.
 *
 * App code depends on this interface — not on Orama, vector maps, or RxDB directly.
 * This allows future engines (e.g. PGlite/pgvector) to be added without rewriting consumers.
 */
export interface LocalHybridSearchEngine {
  /**
   * Index a document for both lexical and semantic search.
   * Idempotent: re-indexing with the same document updates existing entries.
   */
  indexDocument(document: SearchDocument, db?: RyuDatabase): Promise<void>;

  /**
   * Remove a document from all search indexes.
   */
  removeDocument(documentId: string, db?: RyuDatabase): Promise<void>;

  /**
   * Execute a hybrid search query combining lexical + semantic + fusion + ranking.
   */
  search(request: HybridSearchQuery): Promise<HybridSearchResponse>;

  /**
   * Rebuild all search indexes from scratch.
   * Used for provider changes, corruption recovery, or major schema migrations.
   */
  rebuild(db?: RyuDatabase): Promise<void>;

  /**
   * Inspect the health of the search index.
   * Returns counts, staleness, and overall health status.
   */
  inspectHealth(db?: RyuDatabase): Promise<SearchIndexHealth>;

  /**
   * Repair detected index issues (missing vectors, stale entries, orphans).
   */
  repair(db?: RyuDatabase): Promise<void>;
}
