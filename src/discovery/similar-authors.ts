/** Similar authors engine. All data is local-first. */

import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc } from "../db/schema";
import { compareAuthorNames } from "../entity-resolution/author-normalizer";
import { getReadingStatus } from "../hooks/useLibrary";
import type { Recommendation, RecommendationReason } from "./types";
import { isEntitySuppressed } from "../recommendations/signal-store";

export type SimilarAuthorsOptions = {
  limit?: number;
  excludeIds?: string[];
  ownerAccountId?: string;
};

export async function findSimilarAuthors(
  options: SimilarAuthorsOptions = {}
): Promise<Recommendation[]> {
  const { limit = 8, excludeIds = [], ownerAccountId } = options;
  const db = await initializeDatabase();
  const allEditions = await db.editions.find().exec();
  const editions = allEditions.map((doc) => doc.toJSON() as EditionDoc);
  const userEditions = editions.filter((edition) => getReadingStatus(edition.id) !== undefined);
  if (userEditions.length === 0) return [];

  const userAuthorIds = new Set<string>();
  for (const edition of userEditions) {
    for (const authorId of edition.authorIds || []) userAuthorIds.add(authorId);
  }
  const excludeSet = new Set([...userAuthorIds, ...excludeIds]);
  const coAuthorScores = new Map<string, number>();

  for (const edition of editions) {
    const authorIds = edition.authorIds || [];
    if (!authorIds.some((authorId) => userAuthorIds.has(authorId))) continue;
    for (const authorId of authorIds) {
      if (excludeSet.has(authorId)) continue;
      if (ownerAccountId && isEntitySuppressed("author", authorId, ownerAccountId)) continue;
      coAuthorScores.set(authorId, (coAuthorScores.get(authorId) || 0) + 1);
    }
  }

  const allAuthors = await db.authors.find().exec();
  const authors = allAuthors.map((doc) => doc.toJSON() as AuthorDoc);
  const userAuthorNames = authors
    .filter((author) => userAuthorIds.has(author.id))
    .map((author) => author.name);
  const recommendations: Recommendation[] = [];
  const seenIds = new Set<string>();

  for (const [authorId, count] of coAuthorScores.entries()) {
    if (seenIds.has(authorId)) continue;
    const author = authors.find((candidate) => candidate.id === authorId);
    if (!author) continue;
    const score = Math.min(count / 3, 1) * 0.75;
    const reason: RecommendationReason = { type: "similar_author", confidence: score };
    recommendations.push({
      id: authorId,
      entityType: "author",
      title: author.name,
      authorIds: [authorId],
      reasons: [reason],
      source: "local_library",
      score,
      generatedAt: new Date().toISOString()
    });
    seenIds.add(authorId);
  }

  for (const author of authors) {
    if (excludeSet.has(author.id) || seenIds.has(author.id)) continue;
    if (ownerAccountId && isEntitySuppressed("author", author.id, ownerAccountId)) continue;
    let bestSimilarity = 0;
    let bestSourceName = "";
    for (const userName of userAuthorNames) {
      const similarity = compareAuthorNames(author.name, userName);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestSourceName = userName;
      }
    }
    if (bestSimilarity >= 0.3 && bestSimilarity < 1) {
      recommendations.push({
        id: author.id,
        entityType: "author",
        title: author.name,
        authorIds: [author.id],
        reasons: [{
          type: "similar_author",
          sourceLabel: bestSourceName,
          confidence: bestSimilarity * 0.6
        }],
        source: "local_library",
        score: bestSimilarity * 0.5,
        generatedAt: new Date().toISOString()
      });
      seenIds.add(author.id);
    }
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
}
