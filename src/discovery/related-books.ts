/**
 * Phase 34 - Related books engine.
 *
 * Finds books related to a given edition by:
 * - Same author (other books by the same author)
 * - Same work/series (other editions of the same work)
 * - Similar title keywords (keyword overlap)
 *
 * All data comes from the local RxDB database. No network calls.
 */

import { initializeDatabase } from "../db/client";
import type { EditionDoc } from "../db/schema";
import type { Recommendation, RecommendationReason } from "./types";

/**
 * Extract meaningful keywords from a title for similarity matching.
 * Strips common stop words and short tokens.
 */
function extractTitleKeywords(title: string): string[] {
  if (typeof title !== "string") return [];
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for",
    "is", "it", "by", "with", "from", "as", "that", "this", "was", "are"
  ]);

  return title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculate keyword similarity between two titles.
 * Returns a score from 0.0 to 1.0 based on Jaccard index.
 */
function titleSimilarity(titleA: string, titleB: string): number {
  const wordsA = new Set(extractTitleKeywords(titleA));
  const wordsB = new Set(extractTitleKeywords(titleB));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export type RelatedBooksOptions = {
  /** Maximum number of related books to return. */
  limit?: number;
  /** Minimum similarity threshold for title-based matches. */
  titleSimilarityThreshold?: number;
  /** Edition IDs to exclude from results. */
  excludeIds?: string[];
};

/**
 * Find books related to a given edition from the local database.
 */
export async function findRelatedBooks(
  editionId: string,
  options: RelatedBooksOptions = {}
): Promise<Recommendation[]> {
  const {
    limit = 10,
    titleSimilarityThreshold = 0.3,
    excludeIds = []
  } = options;

  const db = await initializeDatabase();

  const editionDoc = await db.editions.findOne(editionId).exec();
  if (!editionDoc) return [];

  const edition = editionDoc.toJSON() as EditionDoc;
  const excludeSet = new Set([editionId, ...excludeIds]);

  const recommendations: Recommendation[] = [];
  const seenIds = new Set<string>();

  // Fetch all editions once for reuse
  const allEditionDocs = await db.editions.find().exec();

  // 1. Same author - find other editions by the same author(s)
  if ((edition.authorIds || []).length > 0) {
    const editionAuthorSet = new Set(edition.authorIds || []);
    const authorDocs = await db.authors.findByIds([...editionAuthorSet]).exec();

    for (const doc of allEditionDocs) {
      const other = doc.toJSON() as EditionDoc;
      if (excludeSet.has(other.id) || seenIds.has(other.id)) continue;

      const sharedAuthors = (other.authorIds || []).filter((aid) =>
        editionAuthorSet.has(aid)
      );

      if (sharedAuthors.length > 0) {
        const authorNames = sharedAuthors
          .map((aid) => {
            const authorDoc = authorDocs.get(aid);
            return authorDoc ? (authorDoc.toJSON() as { name: string }).name : undefined;
          })
          .filter(Boolean);

        const reason: RecommendationReason = {
          type: "same_author",
          sourceId: editionId,
          sourceLabel: authorNames[0] || edition.title,
          confidence: 0.8
        };

        recommendations.push({
          id: other.id,
          entityType: "edition",
          title: other.title,
          coverUrl: other.coverUrl,
          author: authorNames.join(", "),
          reasons: [reason],
          source: "local_library",
          score: 0.8,
          generatedAt: new Date().toISOString()
        });
        seenIds.add(other.id);
      }
    }
  }

  // 2. Same work - find other editions of the same work
  if (edition.workId) {
    const sameWorkEditions = await db.editions
      .find({ selector: { workId: edition.workId } })
      .exec();

    for (const doc of sameWorkEditions) {
      const other = doc.toJSON() as EditionDoc;
      if (excludeSet.has(other.id) || seenIds.has(other.id)) continue;

      const reason: RecommendationReason = {
        type: "same_work",
        sourceId: editionId,
        sourceLabel: edition.title,
        confidence: 0.9
      };

      recommendations.push({
        id: other.id,
        entityType: "edition",
        title: other.title,
        coverUrl: other.coverUrl,
        reasons: [reason],
        source: "local_library",
        score: 0.9,
        generatedAt: new Date().toISOString()
      });
      seenIds.add(other.id);
    }
  }

  // 3. Similar title keywords
  for (const doc of allEditionDocs) {
    const other = doc.toJSON() as EditionDoc;
    if (excludeSet.has(other.id) || seenIds.has(other.id)) continue;

    const similarity = titleSimilarity(edition.title, other.title);
    if (similarity >= titleSimilarityThreshold) {
      const reason: RecommendationReason = {
        type: "similar_title",
        sourceId: editionId,
        sourceLabel: edition.title,
        confidence: similarity
      };

      recommendations.push({
        id: other.id,
        entityType: "edition",
        title: other.title,
        coverUrl: other.coverUrl,
        reasons: [reason],
        source: "local_library",
        score: similarity * 0.7,
        generatedAt: new Date().toISOString()
      });
      seenIds.add(other.id);
    }
  }

  // Sort by score descending and limit
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Visible for tests. */
export { extractTitleKeywords, titleSimilarity };
