/**
 * Progressive hybrid search API.
 *
 * Streams partial results to the caller as the pipeline advances:
 *   1. lexical:  Orama results (fast, available first)
 *   2. semantic: vector hits added (may take longer for MiniLM/EmbeddingGemma)
 *   3. fused:    blended + ranked + reranked results
 *   4. complete: final HybridSearchResponse with diagnostics
 *
 * Concurrency model (intentional):
 *   - Lexical search and semantic search start concurrently as soon as the
 *     query is normalized so the lexical stage can emit before any slow
 *     embedding work or LLM intent refinement completes.
 *   - LLM intent refinement runs in parallel with the searches and is only
 *     awaited at fusion time, where alpha is needed.
 *
 * Failures degrade safely:
 *   - Semantic provider failure → falls back to lexical-only
 *   - Lexical failure (rare) → still attempts semantic
 *   - Expansion failure → falls back to the normalized query (does NOT
 *     short-circuit the search) and emits a structured error update
 *   - Total failure → emits 'error' update with structured detail
 *
 * Keeps the existing non-progressive API (`engine.search()`) intact.
 */

import type { RankedSearchResult, SearchOptions } from "../types";
import type { GroupedSearchResults } from "../group";
import { groupResults } from "../group";
import { searchOrama } from "../orama";
import { semanticSearchLocal } from "../vector-index";
import { dedupe, fuseResults } from "../ranking";
import { applyContextBoosts } from "../context-ranking";
import { applyFeedbackBoosts } from "../feedback-ranking";
import { rerankResults } from "../rerank";
import { applyExploration } from "../exploration";
import { attachExplanations } from "../explain";
import { getAdaptiveAlpha } from "../weights";
import { classifyQueryIntent } from "../intent";
import { refineIntentWithLLM } from "../intent-llm";
import { getSearchPreferences } from "../preferences";
import { getRerankerProvider } from "../reranker-provider";
import { normalizeSearchQuery } from "../query-normalize";
import { buildSearchQueryExpansionPlan } from "../query-expansion";
import { getEmbeddingProvider } from "../embedding-provider";
import type { HybridSearchDiagnostics, HybridSearchQuery, HybridSearchResponse } from "./hybridSearchTypes";

/**
 * A structured error surfaced through progressive search.
 */
export type SearchError = {
  message: string;
  stage: "lexical" | "semantic" | "fusion" | "rerank" | "expansion" | "unknown";
  recoverable: boolean;
};

export type ProgressiveSearchUpdate =
  | { stage: "lexical"; results: RankedSearchResult[] }
  | { stage: "semantic"; results: RankedSearchResult[] }
  | { stage: "fused"; results: RankedSearchResult[] }
  | { stage: "complete"; response: HybridSearchResponse }
  | { stage: "error"; error: SearchError };

export type ProgressiveUpdateHandler = (update: ProgressiveSearchUpdate) => void;

/**
 * Run the hybrid search pipeline, streaming intermediate stages to the caller.
 *
 * The returned promise resolves with the same `HybridSearchResponse` that
 * `engine.search()` would produce. Each stage is also delivered to `onUpdate`.
 */
export async function searchProgressively(
  request: HybridSearchQuery,
  onUpdate: ProgressiveUpdateHandler
): Promise<HybridSearchResponse> {
  const startMs = performance.now();
  const provider = getEmbeddingProvider();
  const normalizedQuery = normalizeSearchQuery(request.query);

  if (normalizedQuery.length < 2) {
    const empty = emptyResponse(request.query, normalizedQuery, provider, performance.now() - startMs);
    safeEmit(onUpdate, { stage: "complete", response: empty });
    return empty;
  }

  const options: SearchOptions = {
    limit: request.limit,
    db: request.db,
    ...request.options
  };

  // Query expansion — fall back to the raw normalized query if it fails.
  // A transient expansion failure must not be indistinguishable from
  // a no-results query.
  let primaryQuery = normalizedQuery;
  let semanticQuery = normalizedQuery;
  try {
    const expansion = await buildSearchQueryExpansionPlan(normalizedQuery, options.db);
    if (expansion.normalizedQuery.length >= 2) {
      primaryQuery = expansion.normalizedQuery;
      semanticQuery = expansion.semanticQuery || expansion.normalizedQuery;
    }
  } catch (error) {
    safeEmit(onUpdate, {
      stage: "error",
      error: { message: messageOf(error), stage: "expansion", recoverable: true }
    });
    // Continue with normalizedQuery as the primary/semantic query.
  }

  // Intent classification (sync) gates alpha — start LLM refinement now,
  // but await it only at fusion time. This lets lexical/semantic stages
  // emit immediately without waiting on a slow LLM call.
  const baseIntent = classifyQueryIntent(primaryQuery);
  const intentPromise = refineIntentWithLLM(primaryQuery, baseIntent).catch(() => baseIntent);

  // Stages 1 & 2: run lexical + semantic concurrently.
  let lexical: RankedSearchResult[] = [];
  const lexicalPromise = searchOrama(primaryQuery, options.db)
    .then((results) => {
      lexical = results;
      safeEmit(onUpdate, { stage: "lexical", results });
    })
    .catch((error) => {
      safeEmit(onUpdate, {
        stage: "error",
        error: { message: messageOf(error), stage: "lexical", recoverable: true }
      });
    });

  let semantic: RankedSearchResult[] = [];
  const semanticPromise = semanticSearchLocal(semanticQuery, 20, options.db)
    .then((results) => {
      semantic = results;
      safeEmit(onUpdate, { stage: "semantic", results });
    })
    .catch((error) => {
      safeEmit(onUpdate, {
        stage: "error",
        error: { message: messageOf(error), stage: "semantic", recoverable: true }
      });
    });

  await Promise.all([lexicalPromise, semanticPromise]);

  // Now fold in the intent refinement result for ranking.
  const intent = await intentPromise;
  const adaptiveAlpha = getAdaptiveAlpha(intent.alpha, intent.intent);

  // Stage 3: fusion + ranking pipeline.
  let final: RankedSearchResult[] = [];
  try {
    const fused = fuseResults(lexical, semantic, adaptiveAlpha);
    const cleaned = dedupe(fused);
    const withContext = applyContextBoosts(cleaned, options.context);
    const withFeedback = applyFeedbackBoosts(primaryQuery, withContext);

    const prefs = getSearchPreferences();
    const mergedPreferences = { ...intent.preferredTypes, ...prefs.preferredTypes };

    const reranked = rerankResults(withFeedback, { preferredTypes: mergedPreferences });
    const explored = applyExploration(reranked);

    const rerankerProvider = getRerankerProvider();
    final = rerankerProvider ? await rerankerProvider.rerank(primaryQuery, explored) : explored;

    safeEmit(onUpdate, { stage: "fused", results: final });
  } catch (error) {
    safeEmit(onUpdate, {
      stage: "error",
      error: { message: messageOf(error), stage: "fusion", recoverable: true }
    });
    final = lexical;
  }

  const grouped: GroupedSearchResults<RankedSearchResult> = groupResults(
    attachExplanations(final, { ...intent, alpha: adaptiveAlpha }, options.context)
  );

  const finalCount = grouped.all.length;
  const fusedCount = (lexical.length + semantic.length) > 0 ? finalCount : 0;
  const durationMs = performance.now() - startMs;

  const diagnostics: HybridSearchDiagnostics = {
    lexicalCount: lexical.length,
    semanticCount: semantic.length,
    fusedCount,
    finalCount,
    providerId: provider.id,
    providerDimensions: provider.dimensions,
    usedSemantic: semantic.length > 0,
    repairedBeforeSearch: false,
    durationMs
  };

  const response: HybridSearchResponse = {
    query: request.query,
    normalizedQuery: primaryQuery,
    results: grouped,
    diagnostics
  };

  safeEmit(onUpdate, { stage: "complete", response });
  return response;
}

function emptyResponse(
  query: string,
  normalizedQuery: string,
  provider: { id: string; dimensions: number },
  durationMs: number
): HybridSearchResponse {
  return {
    query,
    normalizedQuery,
    results: null,
    diagnostics: {
      lexicalCount: 0,
      semanticCount: 0,
      fusedCount: 0,
      finalCount: 0,
      providerId: provider.id,
      providerDimensions: provider.dimensions,
      usedSemantic: false,
      repairedBeforeSearch: false,
      durationMs
    }
  };
}

function safeEmit(handler: ProgressiveUpdateHandler, update: ProgressiveSearchUpdate): void {
  try {
    handler(update);
  } catch {
    // Listener errors must never break the search pipeline.
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
