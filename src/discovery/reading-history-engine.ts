/** Reading-history recommendation engine. All data is local-first. */

import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc } from "../db/schema";
import { getReadingStatus, type ReadingStatus } from "../hooks/useLibrary";
import type { Recommendation, RecommendationReason } from "./types";
import { isEntitySuppressed } from "../recommendations/signal-store";

export type ReadingHistoryOptions = {
  limit?: number;
  statuses?: ReadingStatus[];
  excludeIds?: string[];
  ownerAccountId?: string;
};

export async function findBecauseYouRead(
  options: ReadingHistoryOptions = {}
): Promise<Recommendation[]> {
  const {
    limit = 10,
    statuses = ["read", "reading"],
    excludeIds = [],
    ownerAccountId
  } = options;
  const db = await initializeDatabase();
  const allEditionDocs = await db.editions.find().exec();
  const allEditions = allEditionDocs.map((doc) => doc.toJSON() as EditionDoc);
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

  const authorFrequency = new Map<string, { count: number; titles: string[] }>();
  const authorToEdition = new Map<string, EditionDoc>();
  for (const edition of historyEditions) {
    for (const authorId of edition.authorIds || []) {
      const entry = authorFrequency.get(authorId) || { count: 0, titles: [] };
      entry.count++;
      if (entry.titles.length < 3) entry.titles.push(edition.title);
      authorFrequency.set(authorId, entry);
      const existing = authorToEdition.get(authorId);
      if (!existing || edition.updatedAt > existing.updatedAt) authorToEdition.set(authorId, edition);
    }
  }

  const authorIds = [...authorFrequency.keys()];
  const authorDocs = authorIds.length > 0
    ? await db.authors.findByIds(authorIds).exec()
    : new Map();
  const recommendations: Recommendation[] = [];
  const seenIds = new Set<string>();

  for (const candidate of candidateEditions) {
    if (seenIds.has(candidate.id) || excludeSet.has(candidate.id)) continue;
    if (ownerAccountId && isEntitySuppressed("edition", candidate.id, ownerAccountId)) continue;
    if (ownerAccountId && (candidate.authorIds || []).some((authorId) =>
      isEntitySuppressed("author", authorId, ownerAccountId)
    )) continue;

    const matchingAuthorIds = (candidate.authorIds || []).filter((authorId) =>
      authorFrequency.has(authorId)
    );
    if (matchingAuthorIds.length === 0) continue;

    let bestAuthorId = matchingAuthorIds[0];
    let bestCount = 0;
    for (const authorId of matchingAuthorIds) {
      const entry = authorFrequency.get(authorId);
      if (entry && entry.count > bestCount) {
        bestCount = entry.count;
        bestAuthorId = authorId;
      }
    }

    const authorDoc = authorDocs.get(bestAuthorId);
    const authorName = authorDoc ? (authorDoc.toJSON() as AuthorDoc).name : undefined;
    const sourceEdition = authorToEdition.get(bestAuthorId);
    const confidence = Math.min(bestCount / 5, 1) * 0.85;
    const reason: RecommendationReason = {
      type: "because_you_read",
      sourceId: sourceEdition?.id,
      sourceLabel: sourceEdition?.title || "",
      confidence
    };

    recommendations.push({
      id: candidate.id,
      entityType: "edition",
      title: candidate.title,
      coverUrl: candidate.coverUrl,
      author: authorName,
      authorIds: [...(candidate.authorIds || [])],
      reasons: [reason],
      source: "local_library",
      score: confidence,
      generatedAt: new Date().toISOString()
    });
    seenIds.add(candidate.id);
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
}
