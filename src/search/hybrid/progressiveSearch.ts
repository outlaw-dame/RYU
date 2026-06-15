/**
 * Progressive hybrid search API.
 *
 * Streams partial results to the caller as the pipeline advances:
 *   1. lexical:  Orama results (fast, available first)
 *   2. semantic: vector hits added (may take longer for MiniLM/EmbeddingGemma)
 *   3. fused:    blended + ranked + reranked results
 *   4. complete: final HybridSearchResponse with diagnostics
 *
 * Failures degrade safely:
 *   - Semantic provider failure → falls back to lexical-only
 *   - Lexical failure (rare) → still attempts semantic
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
  stage: "lexical" | "semantic" | "fusion" | "rerank" | "unknown";
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
    onUpdate({ stage: "complete", response: empty });
    return empty;
  }

  const options: SearchOptions = {
    limit: request.limit,
    db: request.db,
    ...request.options
  };

  // Query expansion is fast enough to do up front.
  const expansion = await buildSearchQueryExpansionPlan(normalizedQuery, options.db).catch(() => null);
  if (!expansion || expansion.normalizedQuery.length < 2) {
    const empty = emptyResponse(request.query, normalizedQuery, provider, performance.now() - startMs);
    onUpdate({ stage: "complete", response: empty });
    return empty;
  }

  const primaryQuery = expansion.normalizedQuery;
  const semanticQuery = expansion.semanticQuery || primaryQuery;

  // Intent classification gates alpha. Continue on failure (alpha falls back).
  let intent = classifyQueryIntent(primaryQuery);
  intent = await refineIntentWithLLM(primaryQuery, intent).catch(() => intent);
  const adaptiveAlpha = getAdaptiveAlpha(intent.alpha, intent.intent);

  // Stage 1: lexical (fast). Run early so the UI can show something quickly.
  let lexical: RankedSearchResult[] = [];
  try {
    lexical = await searchOrama(primaryQuery, options.db);
    safeEmit(onUpdate, { stage: "lexical", results: lexical });
  } catch (error) {
    safeEmit(onUpdate, {
      stage: "error",
      error: { message: messageOf(error), stage: "lexical", recoverable: true }
    });
    // Continue: lexical failure should not stop semantic.
  }

  // Stage 2: semantic. May fail (model unavailable) — degrade gracefully.
  let semantic: RankedSearchResult[] = [];
  try {
    semantic = await semanticSearchLocal(semanticQuery, 20, options.db);
    safeEmit(onUpdate, { stage: "semantic", results: semantic });
  } catch (error) {
    safeEmit(onUpdate, {
      stage: "error",
      error: { message: messageOf(error), stage: "semantic", recoverable: true }
    });
  }

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
    // Even if fusion fails, attempt to surface lexical results alone.
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
