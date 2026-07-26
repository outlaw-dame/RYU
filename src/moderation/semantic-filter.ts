/**
 * Semantic keyword filter.
 *
 * Uses the existing embedding infrastructure (MiniLM/EmbeddingGemma deterministic
 * fallback) to perform semantic similarity matching for content filters. A filter
 * for "violence" will also catch "brutal attack", "graphic fight scene", etc.
 *
 * Falls back to exact/regex matching when embeddings are unavailable.
 */

import { getEmbeddingProvider } from "../search/embedding-provider";
import { cosineSimilarity } from "../search/embeddings";
import { buildKeywordRegex } from "./keyword-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SemanticFilterKeyword = {
  id: string;
  keyword: string;
  wholeWord: boolean;
  /** Pre-computed embedding for semantic matching. Null if not yet computed. */
  embedding?: number[] | null;
};

export type SemanticFilter = {
  id: string;
  title: string;
  keywords: SemanticFilterKeyword[];
  /** Similarity threshold (0-1). Default 0.65. */
  threshold: number;
  /** Whether semantic matching is enabled (falls back to exact if false). */
  semanticEnabled: boolean;
};

export type SemanticMatchResult = {
  matched: boolean;
  matchType: "exact" | "semantic" | "none";
  /** Best similarity score if semantic matching was attempted. */
  similarity: number;
  /** The keyword that matched. */
  matchedKeyword?: string;
};

// ─── Configuration ────────────────────────────────────────────────────────────

/** Default similarity threshold for semantic matching. */
export const DEFAULT_SEMANTIC_THRESHOLD = 0.65;

/** Minimum threshold allowed. */
export const MIN_SEMANTIC_THRESHOLD = 0.4;

/** Maximum threshold allowed. */
export const MAX_SEMANTIC_THRESHOLD = 0.95;

// ─── Embedding Cache ──────────────────────────────────────────────────────────

const embeddingCache = new Map<string, number[]>();

/**
 * Get or compute embedding for a text string.
 * Uses an in-memory cache to avoid recomputing embeddings for the same text.
 */
export async function getOrComputeEmbedding(text: string): Promise<number[] | null> {
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) return null;

  const cached = embeddingCache.get(normalizedText);
  if (cached) return cached;

  try {
    const provider = getEmbeddingProvider();
    const embedding = await provider.embed(normalizedText);
    if (embedding && embedding.length > 0) {
      embeddingCache.set(normalizedText, embedding);
      return embedding;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the embedding cache. Useful for testing or when the provider changes.
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

// ─── Semantic Matching ────────────────────────────────────────────────────────

/**
 * Compute semantic similarity between two text strings.
 * Returns 0 if embeddings cannot be computed.
 */
export async function computeSemanticSimilarity(textA: string, textB: string): Promise<number> {
  const [embA, embB] = await Promise.all([
    getOrComputeEmbedding(textA),
    getOrComputeEmbedding(textB)
  ]);

  if (!embA || !embB) return 0;
  return cosineSimilarity(embA, embB);
}

/**
 * Check if content text semantically matches a filter keyword.
 *
 * Strategy:
 * 1. Try exact/regex match first (fast path).
 * 2. If semantic is enabled and no exact match, compute similarity.
 * 3. Return match if similarity exceeds threshold.
 */
export async function semanticMatch(
  content: string,
  filter: SemanticFilter
): Promise<SemanticMatchResult> {
  if (!content || !content.trim()) {
    return { matched: false, matchType: "none", similarity: 0 };
  }

  // Fast path: try exact/regex matching first
  for (const kw of filter.keywords) {
    const pattern = buildKeywordRegex(kw.keyword, kw.wholeWord);
    if (pattern.test(content)) {
      return {
        matched: true,
        matchType: "exact",
        similarity: 1.0,
        matchedKeyword: kw.keyword
      };
    }
  }

  // Semantic path: compute embedding similarity
  if (!filter.semanticEnabled) {
    return { matched: false, matchType: "none", similarity: 0 };
  }

  const threshold = Math.max(
    MIN_SEMANTIC_THRESHOLD,
    Math.min(MAX_SEMANTIC_THRESHOLD, filter.threshold)
  );

  let bestSimilarity = 0;
  let bestKeyword: string | undefined;

  const contentEmbedding = await getOrComputeEmbedding(content);
  if (!contentEmbedding) {
    // Embedding unavailable, fall back to no match on semantic path
    return { matched: false, matchType: "none", similarity: 0 };
  }

  for (const kw of filter.keywords) {
    // Use pre-computed embedding if available, otherwise compute
    let kwEmbedding = kw.embedding ?? null;
    if (!kwEmbedding) {
      kwEmbedding = await getOrComputeEmbedding(kw.keyword);
    }
    if (!kwEmbedding) continue;

    const similarity = cosineSimilarity(contentEmbedding, kwEmbedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestKeyword = kw.keyword;
    }
  }

  if (bestSimilarity >= threshold) {
    return {
      matched: true,
      matchType: "semantic",
      similarity: bestSimilarity,
      matchedKeyword: bestKeyword
    };
  }

  return { matched: false, matchType: "none", similarity: bestSimilarity };
}

/**
 * Synchronous exact-only match (for use when async is not possible).
 * Does not perform semantic matching.
 */
export function exactMatch(content: string, filter: SemanticFilter): SemanticMatchResult {
  if (!content || !content.trim()) {
    return { matched: false, matchType: "none", similarity: 0 };
  }

  for (const kw of filter.keywords) {
    const pattern = buildKeywordRegex(kw.keyword, kw.wholeWord);
    if (pattern.test(content)) {
      return {
        matched: true,
        matchType: "exact",
        similarity: 1.0,
        matchedKeyword: kw.keyword
      };
    }
  }

  return { matched: false, matchType: "none", similarity: 0 };
}

/**
 * Create a semantic filter from basic parameters.
 */
export function createSemanticFilter(
  id: string,
  title: string,
  keywords: Array<{ keyword: string; wholeWord?: boolean }>,
  options: { threshold?: number; semanticEnabled?: boolean } = {}
): SemanticFilter {
  return {
    id,
    title,
    keywords: keywords.map((kw, idx) => ({
      id: `${id}-kw-${idx}`,
      keyword: kw.keyword,
      wholeWord: kw.wholeWord ?? false,
      embedding: null
    })),
    threshold: options.threshold ?? DEFAULT_SEMANTIC_THRESHOLD,
    semanticEnabled: options.semanticEnabled ?? true
  };
}

/**
 * Pre-compute embeddings for all keywords in a filter.
 * This speeds up subsequent matching by caching the keyword embeddings.
 */
export async function precomputeFilterEmbeddings(filter: SemanticFilter): Promise<SemanticFilter> {
  const updatedKeywords = await Promise.all(
    filter.keywords.map(async (kw) => {
      const embedding = await getOrComputeEmbedding(kw.keyword);
      return { ...kw, embedding };
    })
  );

  return { ...filter, keywords: updatedKeywords };
}
