/**
 * RxDB + Orama hybrid search engine adapter.
 *
 * Wraps the existing search pipeline (searchAll, vector-index, index-lifecycle)
 * behind the stable LocalHybridSearchEngine interface.
 *
 * This adapter calls existing implementation — it does NOT duplicate logic.
 */

import type { RyuDatabase } from "../../db/client";
import type { SearchDocument } from "../types";
import type { SearchIndexHealth } from "../index-lifecycle";
import type {
  HybridSearchDiagnostics,
  HybridSearchQuery,
  HybridSearchResponse,
  LocalHybridSearchEngine
} from "./hybridSearchTypes";
import { searchAll } from "../search";
import { indexDocument as vectorIndexDocument, semanticSearchLocal, clearInMemoryVectorIndex } from "../vector-index";
import { searchOrama } from "../orama";
import {
  inspectSearchIndexHealth,
  repairSearchIndexHealth,
  rebuildSearchVectorsForCurrentProvider
} from "../index-lifecycle";
import { getEmbeddingProvider } from "../embedding-provider";
import { normalizeSearchQuery } from "../query-normalize";

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
      // Remove from persisted vectors in RxDB.
      // The in-memory vector map and Orama index are cleared on next rebuild.
      // Full removal support will be added in Phase 5 (update/delete lifecycle).
      const { initializeDatabase, DEFAULT_RYU_DATABASE_NAME } = await import("../../db/client");
      const database = db ?? await initializeDatabase();
      const vectorCollection = database.collections.searchvectors;
      if (vectorCollection) {
        const docs = await vectorCollection.find({
          selector: { entityId: documentId }
        }).exec();
        for (const doc of docs) {
          await doc.remove();
        }
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

      // Run lexical and semantic separately to capture counts for diagnostics.
      const [lexicalResults, semanticResults] = await Promise.all([
        searchOrama(normalizedQuery, request.db).catch(() => []),
        semanticSearchLocal(normalizedQuery, 20, request.db).catch(() => [])
      ]);

      const usedSemantic = semanticResults.length > 0;

      // Run the full pipeline through searchAll for the authoritative result.
      const results = await searchAll(request.query, {
        limit: request.limit,
        db: request.db,
        ...request.options
      });

      const durationMs = performance.now() - startMs;
      const finalCount = results
        ? results.all.length
        : 0;

      const diagnostics: HybridSearchDiagnostics = {
        lexicalCount: lexicalResults.length,
        semanticCount: semanticResults.length,
        fusedCount: finalCount,
        finalCount,
        providerId: provider.id,
        providerDimensions: provider.dimensions,
        usedSemantic,
        repairedBeforeSearch: false,
        durationMs
      };

      return {
        query: request.query,
        normalizedQuery,
        results,
        diagnostics
      };
    },

    async rebuild(db?: RyuDatabase): Promise<void> {
      clearInMemoryVectorIndex();
      await rebuildSearchVectorsForCurrentProvider(db);
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
