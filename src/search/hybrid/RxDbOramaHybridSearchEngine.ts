/**
 * RxDB + Orama hybrid search engine adapter.
 *
 * Wraps the existing search pipeline (searchAllWithDiagnostics, vector-index, index-lifecycle)
 * behind the stable LocalHybridSearchEngine interface.
 *
 * This adapter calls existing implementation — it does NOT duplicate logic.
 */

import { initializeDatabase, type RyuDatabase } from "../../db/client";
import type { SearchDocument } from "../types";
import type { SearchIndexHealth } from "../index-lifecycle";
import type {
  HybridSearchDiagnostics,
  HybridSearchQuery,
  HybridSearchResponse,
  LocalHybridSearchEngine
} from "./hybridSearchTypes";
import { searchAllWithDiagnostics } from "../search";
import {
  indexDocument as vectorIndexDocument,
  clearInMemoryVectorIndex,
  clearPersistedVectorsForCurrentProvider,
  removeFromInMemoryVectorIndex
} from "../vector-index";
import {
  inspectSearchIndexHealth,
  repairSearchIndexHealth,
  rebuildSearchVectorsForCurrentProvider
} from "../index-lifecycle";
import { getEmbeddingProvider } from "../embedding-provider";
import { normalizeSearchQuery } from "../query-normalize";
import { searchProgressively, type ProgressiveSearchUpdate } from "./progressiveSearch";

/**
 * Creates an instance of the RxDB + Orama hybrid search engine.
 *
 * Usage:
 *   const engine = createRxDbOramaHybridSearchEngine();
 *   const response = await engine.search({ query: "dune" });
 */
export function createRxDbOramaHybridSearchEngine(): LocalHybridSearchEngine {
  return {
    async indexDocument(document: SearchDocument, db?: RyuDatabase): Promise<void> {
      await vectorIndexDocument(document, db);
    },

    async removeDocument(documentId: string, db?: RyuDatabase): Promise<void> {
      // Remove from in-memory vector store immediately
      removeFromInMemoryVectorIndex(documentId);

      // Remove persisted vectors from RxDB
      const database = db ?? await initializeDatabase();
      const vectorCollection = database.searchvectors;
      if (vectorCollection) {
        const docs = await vectorCollection.find({
          selector: { entityId: documentId }
        }).exec();
        await Promise.all(docs.map((doc) => doc.remove()));
      }
    },

    async search(request: HybridSearchQuery): Promise<HybridSearchResponse> {
      const startMs = performance.now();
      const provider = getEmbeddingProvider();
      const normalizedQuery = normalizeSearchQuery(request.query);

      if (normalizedQuery.length < 2) {
        return {
          query: request.query,
          normalizedQuery,
          results: null,
          diagnostics: emptyDiagnostics(provider, performance.now() - startMs)
        };
      }

      // Use searchAllWithDiagnostics to avoid duplicate execution.
      // Semantic failures are caught internally by searchAllWithDiagnostics.
      const result = await searchAllWithDiagnostics(request.query, {
        limit: request.limit,
        db: request.db,
        ...request.options
      });

      const durationMs = performance.now() - startMs;

      const diagnostics: HybridSearchDiagnostics = {
        lexicalCount: result.diagnostics.lexicalCount,
        semanticCount: result.diagnostics.semanticCount,
        fusedCount: result.diagnostics.fusedCount,
        finalCount: result.diagnostics.finalCount,
        providerId: provider.id,
        providerDimensions: provider.dimensions,
        usedSemantic: result.diagnostics.usedSemantic,
        repairedBeforeSearch: false,
        durationMs
      };

      return {
        query: request.query,
        normalizedQuery,
        results: result.grouped,
        diagnostics
      };
    },

    async rebuild(db?: RyuDatabase): Promise<void> {
      clearInMemoryVectorIndex();
      await clearPersistedVectorsForCurrentProvider();
      await rebuildSearchVectorsForCurrentProvider(db);
    },

    async searchProgressively(
      request: HybridSearchQuery,
      onUpdate: (update: ProgressiveSearchUpdate) => void
    ): Promise<HybridSearchResponse> {
      return searchProgressively(request, onUpdate);
    },

    async inspectHealth(db?: RyuDatabase): Promise<SearchIndexHealth> {
      return inspectSearchIndexHealth(db);
    },

    async repair(db?: RyuDatabase): Promise<void> {
      await repairSearchIndexHealth(db);
    }
  };
}

function emptyDiagnostics(
  provider: { id: string; dimensions: number },
  durationMs: number
): HybridSearchDiagnostics {
  return {
    lexicalCount: 0,
    semanticCount: 0,
    fusedCount: 0,
    finalCount: 0,
    providerId: provider.id,
    providerDimensions: provider.dimensions,
    usedSemantic: false,
    repairedBeforeSearch: false,
    durationMs
  };
}
