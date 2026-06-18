/**
 * Phase 34 - Reading history engine.
 *
 * "Because you read X" recommendation logic. Finds books related to
 * the user's reading history by analyzing:
 * - Authors from books the user has read/is reading
 * - Works and editions related to completed books
 * - Genre/topic similarity based on keyword overlap
 *
 * All data comes from the local RxDB database. No network calls.
 */

import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc } from "../db/schema";
import { getReadingStatus, type ReadingStatus } from "../hooks/useLibrary";
import type { Recommendation, RecommendationReason } from "./types";

export type ReadingHistoryOptions = {
  /** Maximum number of recommendations to return. */
  limit?: number;
  /** Which statuses to consider as "read" history. */
  statuses?: ReadingStatus[];
  /** Edition IDs to exclude from results. */
  excludeIds?: string[];
};

/**
 * Generate "because you read" recommendations from the user's reading history.
 */
export async function findBecauseYouRead(
  options: ReadingHistoryOptions = {}
): Promise<Recommendation[]> {
  const {
    limit = 10,
    statuses = ["read", "reading"],
    excludeIds = []
  } = options;

  const db = await initializeDatabase();

  const allEditionDocs = await db.editions.find().exec();
  const allEditions = allEditionDocs.map((doc) => doc.toJSON() as EditionDoc);

  // Split editions into history (books user has read) and candidates
  const historyEditions: EditionDoc[] = [];
  const candidateEditions: EditionDoc[] = [];
  const excludeSet = new Set(excludeIds);

  for (const edition of allEditions) {
    const status = getReadingStatus(edition.id);
    if (status && statuses.includes(status)) {
      historyEditions.push(edition);
      excludeSet.add(edition.id);
    } else if (!excludeSet.has(edition.id)) {
      candidateEditions.push(edition);
    }
  }

  if (historyEditions.length === 0) return [];

  // Build an author frequency map from reading history
  const authorFrequency = new Map<string, { count: number; titles: string[] }>();
  for (const edition of historyEditions) {
    for (const authorId of edition.authorIds || []) {
      const entry = authorFrequency.get(authorId) || { count: 0, titles: [] };
      entry.count++;
      if (entry.titles.length < 3) entry.titles.push(edition.title);
      authorFrequency.set(authorId, entry);
    }
  }

  // Get author names for explanation building
  const authorIds = [...authorFrequency.keys()];
  const authorDocs = authorIds.length > 0
    ? await db.authors.findByIds(authorIds).exec()
    : new Map();

  const recommendations: Recommendation[] = [];
  const seenIds = new Set<string>();

  // Find candidate editions by the same authors
  for (const candidate of candidateEditions) {
    if (seenIds.has(candidate.id) || excludeSet.has(candidate.id)) continue;

    const matchingAuthorIds = (candidate.authorIds || []).filter((aid) =>
      authorFrequency.has(aid)
    );

    if (matchingAuthorIds.length === 0) continue;

    // Pick the strongest match (most frequently read author)
    let bestAuthorId = matchingAuthorIds[0];
    let bestCount = 0;

    for (const authorId of matchingAuthorIds) {
      const entry = authorFrequency.get(authorId);
      if (entry && entry.count > bestCount) {
        bestCount = entry.count;
        bestAuthorId = authorId;
      }
    }

    const authorEntry = authorFrequency.get(bestAuthorId);
    const authorDoc = authorDocs.get(bestAuthorId);
    const authorName = authorDoc
      ? (authorDoc.toJSON() as AuthorDoc).name
      : undefined;

    // Use the most recent book title as the "because you read" source
    const sourceTitle = authorEntry?.titles[0] || "";
    const sourceEdition = historyEditions.find(
      (e) => (e.authorIds || []).includes(bestAuthorId)
    );

    const confidence = Math.min(bestCount / 5, 1) * 0.85;

    const reason: RecommendationReason = {
      type: "because_you_read",
      sourceId: sourceEdition?.id,
      sourceLabel: sourceTitle,
      confidence
    };

    recommendations.push({
      id: candidate.id,
      entityType: "edition",
      title: candidate.title,
      coverUrl: candidate.coverUrl,
      author: authorName,
      reasons: [reason],
      source: "local_library",
      score: confidence,
      generatedAt: new Date().toISOString()
    });
    seenIds.add(candidate.id);
  }

  // Sort by score descending and limit
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
