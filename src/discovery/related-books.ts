/** Related-books recommendation engine. All data is local-first. */

import { initializeDatabase } from "../db/client";
import type { EditionDoc } from "../db/schema";
import type { Recommendation, RecommendationReason } from "./types";
import { isEntitySuppressed } from "../recommendations/signal-store";

function extractTitleKeywords(title: string): string[] {
  if (typeof title !== "string") return [];
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for",
    "is", "it", "by", "with", "from", "as", "that", "this", "was", "are"
  ]);
  return title.toLowerCase().replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word));
}

function titleSimilarity(titleA: string, titleB: string): number {
  const wordsA = new Set(extractTitleKeywords(titleA));
  const wordsB = new Set(extractTitleKeywords(titleB));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const word of wordsA) if (wordsB.has(word)) intersection++;
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export type RelatedBooksOptions = {
  limit?: number;
  titleSimilarityThreshold?: number;
  excludeIds?: string[];
  ownerAccountId?: string;
};

function isSuppressedEdition(edition: EditionDoc, ownerAccountId?: string): boolean {
  if (!ownerAccountId) return false;
  return isEntitySuppressed("edition", edition.id, ownerAccountId) ||
    (edition.authorIds || []).some((authorId) =>
      isEntitySuppressed("author", authorId, ownerAccountId)
    );
}

export async function findRelatedBooks(
  editionId: string,
  options: RelatedBooksOptions = {}
): Promise<Recommendation[]> {
  const {
    limit = 10,
    titleSimilarityThreshold = 0.3,
    excludeIds = [],
    ownerAccountId
  } = options;
  const db = await initializeDatabase();
  const editionDoc = await db.editions.findOne(editionId).exec();
  if (!editionDoc) return [];
  const edition = editionDoc.toJSON() as EditionDoc;
  const excludeSet = new Set([editionId, ...excludeIds]);
  const recommendations: Recommendation[] = [];
  const seenIds = new Set<string>();
  const allEditionDocs = await db.editions.find().exec();

  if ((edition.authorIds || []).length > 0) {
    const editionAuthorSet = new Set(edition.authorIds || []);
    const authorDocs = await db.authors.findByIds([...editionAuthorSet]).exec();
    for (const doc of allEditionDocs) {
      const other = doc.toJSON() as EditionDoc;
      if (excludeSet.has(other.id) || seenIds.has(other.id) || isSuppressedEdition(other, ownerAccountId)) continue;
      const sharedAuthors = (other.authorIds || []).filter((authorId) => editionAuthorSet.has(authorId));
      if (sharedAuthors.length === 0) continue;
      const authorNames = sharedAuthors.map((authorId) => {
        const authorDoc = authorDocs.get(authorId);
        return authorDoc ? (authorDoc.toJSON() as { name: string }).name : undefined;
      }).filter((name): name is string => Boolean(name));
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
        authorIds: [...(other.authorIds || [])],
        reasons: [reason],
        source: "local_library",
        score: 0.8,
        generatedAt: new Date().toISOString()
      });
      seenIds.add(other.id);
    }
  }

  if (edition.workId) {
    const sameWorkEditions = await db.editions.find({ selector: { workId: edition.workId } }).exec();
    for (const doc of sameWorkEditions) {
      const other = doc.toJSON() as EditionDoc;
      if (excludeSet.has(other.id) || seenIds.has(other.id) || isSuppressedEdition(other, ownerAccountId)) continue;
      recommendations.push({
        id: other.id,
        entityType: "edition",
        title: other.title,
        coverUrl: other.coverUrl,
        authorIds: [...(other.authorIds || [])],
        reasons: [{
          type: "same_work",
          sourceId: editionId,
          sourceLabel: edition.title,
          confidence: 0.9
        }],
        source: "local_library",
        score: 0.9,
        generatedAt: new Date().toISOString()
      });
      seenIds.add(other.id);
    }
  }

  for (const doc of allEditionDocs) {
    const other = doc.toJSON() as EditionDoc;
    if (excludeSet.has(other.id) || seenIds.has(other.id) || isSuppressedEdition(other, ownerAccountId)) continue;
    const similarity = titleSimilarity(edition.title, other.title);
    if (similarity < titleSimilarityThreshold) continue;
    recommendations.push({
      id: other.id,
      entityType: "edition",
      title: other.title,
      coverUrl: other.coverUrl,
      authorIds: [...(other.authorIds || [])],
      reasons: [{
        type: "similar_title",
        sourceId: editionId,
        sourceLabel: edition.title,
        confidence: similarity
      }],
      source: "local_library",
      score: similarity * 0.7,
      generatedAt: new Date().toISOString()
    });
    seenIds.add(other.id);
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
}

export { extractTitleKeywords, titleSimilarity };
