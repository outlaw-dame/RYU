/**
 * Phase 34 - Similar authors engine.
 *
 * Finds authors similar to ones in the user's library based on:
 * - Shared works/editions (co-authorship or shared works)
 * - Name similarity (using the entity-resolution author normalizer)
 *
 * All data comes from the local RxDB database. No network calls.
 */

import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc } from "../db/schema";
import { compareAuthorNames } from "../entity-resolution/author-normalizer";
import { getReadingStatus } from "../hooks/useLibrary";
import type { Recommendation, RecommendationReason } from "./types";

export type SimilarAuthorsOptions = {
  /** Maximum number of similar authors to return. */
  limit?: number;
  /** Author IDs to exclude from results. */
  excludeIds?: string[];
};

/**
 * Find authors similar to those in the user's library.
 *
 * Strategy:
 * 1. Identify authors the user has read (books with reading status).
 * 2. Find other authors who share works/editions with those authors.
 * 3. Find authors with similar names (potential aliases or related writers).
 */
export async function findSimilarAuthors(
  options: SimilarAuthorsOptions = {}
): Promise<Recommendation[]> {
  const { limit = 8, excludeIds = [] } = options;

  const db = await initializeDatabase();

  // Get all editions and identify the user's authors
  const allEditions = await db.editions.find().exec();
  const editions = allEditions.map((doc) => doc.toJSON() as EditionDoc);

  // Find editions the user has interacted with (has a reading status)
  const userEditions = editions.filter((e) => getReadingStatus(e.id) !== undefined);
  if (userEditions.length === 0) return [];

  // Collect the user's known author IDs
  const userAuthorIds = new Set<string>();
  for (const edition of userEditions) {
    for (const authorId of edition.authorIds) {
      userAuthorIds.add(authorId);
    }
  }

  const excludeSet = new Set([...userAuthorIds, ...excludeIds]);

  // Find all co-authors (authors who appear on editions with the user's authors)
  const coAuthorScores = new Map<string, number>();
  for (const edition of editions) {
    const hasUserAuthor = edition.authorIds.some((aid) => userAuthorIds.has(aid));
    if (!hasUserAuthor) continue;

    for (const authorId of edition.authorIds) {
      if (excludeSet.has(authorId)) continue;
      coAuthorScores.set(authorId, (coAuthorScores.get(authorId) || 0) + 1);
    }
  }

  // Get all authors for name matching
  const allAuthors = await db.authors.find().exec();
  const authors = allAuthors.map((doc) => doc.toJSON() as AuthorDoc);

  const userAuthorNames = authors
    .filter((a) => userAuthorIds.has(a.id))
    .map((a) => a.name);

  const recommendations: Recommendation[] = [];
  const seenIds = new Set<string>();

  // Add co-authors as recommendations
  for (const [authorId, count] of coAuthorScores.entries()) {
    if (seenIds.has(authorId)) continue;
    const author = authors.find((a) => a.id === authorId);
    if (!author) continue;

    const score = Math.min(count / 3, 1) * 0.75;
    const reason: RecommendationReason = {
      type: "similar_author",
      confidence: score
    };

    recommendations.push({
      id: authorId,
      entityType: "author",
      title: author.name,
      reasons: [reason],
      source: "local_library",
      score,
      generatedAt: new Date().toISOString()
    });
    seenIds.add(authorId);
  }

  // Find authors with similar names to user's authors
  for (const author of authors) {
    if (excludeSet.has(author.id) || seenIds.has(author.id)) continue;

    let bestSimilarity = 0;
    let bestSourceName = "";

    for (const userName of userAuthorNames) {
      const similarity = compareAuthorNames(author.name, userName);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestSourceName = userName;
      }
    }

    // Only include if there is meaningful (but not exact) name similarity
    if (bestSimilarity >= 0.3 && bestSimilarity < 1.0) {
      const reason: RecommendationReason = {
        type: "similar_author",
        sourceLabel: bestSourceName,
        confidence: bestSimilarity * 0.6
      };

      recommendations.push({
        id: author.id,
        entityType: "author",
        title: author.name,
        reasons: [reason],
        source: "local_library",
        score: bestSimilarity * 0.5,
        generatedAt: new Date().toISOString()
      });
      seenIds.add(author.id);
    }
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
