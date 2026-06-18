/**
 * Phase 31 - Activity classifier.
 *
 * Classifies a MastodonStatus as book-related (review, rating, reading update,
 * recommendation, discussion) or general social content.
 *
 * Uses content heuristics: hashtags, keywords in text, presence of star ratings,
 * BookWyrm-specific patterns, and link/card detection.
 */

import type { MastodonStatus } from "../sync/mastodon-client";
import type { BookActivity, BookActivityType } from "./types";

/** Hashtags strongly associated with book activity. */
const BOOK_HASHTAGS = new Set([
  "bookstodon",
  "bookwyrm",
  "books",
  "reading",
  "amreading",
  "nowreading",
  "currentlyreading",
  "bookreview",
  "bookreviews",
  "bookrecommendation",
  "bookrecommendations",
  "bookclub",
  "readinglist",
  "tbr",
  "bookish",
  "bibliophile",
  "bookstagram",
  "booktok",
  "readersofmastodon",
  "litfiction",
  "scifi",
  "fantasy",
  "nonfiction",
  "fiction",
  "romance",
  "thriller",
  "mystery",
  "horror",
  "poetry",
  "ya",
  "graphicnovel",
  "manga",
  "audiobook",
  "ebook",
  "bookhaul",
  "bookworm"
]);

/** Hashtags specifically indicating a review. */
const REVIEW_HASHTAGS = new Set([
  "bookreview",
  "bookreviews",
  "review",
  "bookrating"
]);

/** Hashtags specifically indicating a recommendation. */
const RECOMMENDATION_HASHTAGS = new Set([
  "bookrecommendation",
  "bookrecommendations",
  "recommend",
  "mustread",
  "tbr",
  "readinglist"
]);

/** Hashtags specifically indicating a reading update. */
const READING_UPDATE_HASHTAGS = new Set([
  "nowreading",
  "currentlyreading",
  "amreading",
  "reading",
  "readingupdate",
  "bookupdate"
]);

/** Keywords in plain text that indicate book content. */
const BOOK_KEYWORDS_RE = /\b(just finished|currently reading|started reading|book review|reading update|want to read|finished reading|dnf|did not finish|page \d+|chapter \d+|5 stars?|4 stars?|3 stars?|2 stars?|1 star|half star|out of 5|\d+\/5|rating:?\s*\d|★|⭐|📖|📚|🔖)\b/i;

/** Star rating patterns (unicode stars, emoji, or text-based). */
const RATING_PATTERN = /([★⭐]{1,5}|(\d(\.\d)?)\s*\/\s*5|\b[1-5]\s+stars?\b|rating:?\s*[1-5])/i;

/** BookWyrm-specific content patterns. */
const BOOKWYRM_PATTERNS = /\b(finished reading|wants to read|started reading|rated it|reviewed)\b/i;

/**
 * Extract hashtags from HTML content of a status.
 */
function extractHashtags(content: string): string[] {
  const tagMatches = content.match(/class="[^"]*hashtag[^"]*"[^>]*>#?(\w+)/gi) ?? [];
  const extracted: string[] = [];

  for (const match of tagMatches) {
    const textMatch = match.match(/#?(\w+)$/);
    if (textMatch) {
      extracted.push(textMatch[1].toLowerCase());
    }
  }

  // Also match plain text hashtags (e.g. from spoiler_text or stripped content)
  const plainHashtags = content.match(/#(\w{2,})/g) ?? [];
  for (const tag of plainHashtags) {
    extracted.push(tag.slice(1).toLowerCase());
  }

  return [...new Set(extracted)];
}

/**
 * Strip HTML tags to get plain text content.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Classify a single MastodonStatus into a BookActivity.
 */
export function classifyActivity(status: MastodonStatus): BookActivity {
  const content = status.content ?? "";
  const spoilerText = status.spoiler_text ?? "";
  const plainText = stripHtml(content + " " + spoilerText);

  const hashtags = extractHashtags(content + " " + spoilerText);
  const relevantHashtags = hashtags.filter((tag) => BOOK_HASHTAGS.has(tag));

  // Determine activity type with scoring
  let activityType: BookActivityType = "general";
  let confidence = 0;

  const hasBookKeywords = BOOK_KEYWORDS_RE.test(plainText);
  const hasRating = RATING_PATTERN.test(plainText);
  const hasBookWyrmPattern = BOOKWYRM_PATTERNS.test(plainText);
  const hasBookHashtags = relevantHashtags.length > 0;
  const hasReviewHashtag = hashtags.some((t) => REVIEW_HASHTAGS.has(t));
  const hasRecommendationHashtag = hashtags.some((t) => RECOMMENDATION_HASHTAGS.has(t));
  const hasReadingUpdateHashtag = hashtags.some((t) => READING_UPDATE_HASHTAGS.has(t));

  // Score-based classification
  if (hasRating || hasReviewHashtag) {
    if (hasRating && plainText.length > 80) {
      activityType = "review";
      confidence = hasReviewHashtag ? 0.95 : 0.85;
    } else if (hasRating) {
      activityType = "rating";
      confidence = 0.9;
    } else {
      activityType = "review";
      confidence = 0.8;
    }
  } else if (hasReadingUpdateHashtag || hasBookWyrmPattern) {
    activityType = "reading-update";
    confidence = hasBookWyrmPattern ? 0.9 : 0.8;
  } else if (hasRecommendationHashtag) {
    activityType = "recommendation";
    confidence = 0.8;
  } else if (hasBookHashtags && hasBookKeywords) {
    activityType = "discussion";
    confidence = 0.75;
  } else if (hasBookHashtags) {
    activityType = "discussion";
    confidence = 0.6;
  } else if (hasBookKeywords) {
    activityType = "discussion";
    confidence = 0.5;
  }

  const isBookRelated = activityType !== "general";

  // Extract potential book title references
  const bookReferences = extractBookReferences(plainText, hashtags);

  return {
    status,
    activityType,
    isBookRelated,
    bookReferences,
    relevantHashtags,
    confidence
  };
}

/**
 * Extract potential book title references from text content.
 * Looks for quoted titles, title-case phrases near book keywords, etc.
 */
function extractBookReferences(text: string, _hashtags: string[]): string[] {
  const references: string[] = [];

  // Match quoted titles (single or double quotes, curly quotes)
  const quotedMatches = text.match(/[""\u201C\u201D]([^""\u201C\u201D]{3,80})[""\u201C\u201D]/g) ?? [];
  for (const match of quotedMatches) {
    const title = match.slice(1, -1).trim().toLowerCase();
    if (title.length >= 3 && title.length <= 80) {
      references.push(title);
    }
  }

  // Match "by Author" patterns which often follow a book title
  const byAuthorPattern = /(?:reading|finished|reviewing|recommend)\s+(.{3,60})\s+by\s+/gi;
  let byMatch: RegExpExecArray | null;
  while ((byMatch = byAuthorPattern.exec(text)) !== null) {
    const candidate = byMatch[1].trim().toLowerCase();
    if (candidate.length >= 3 && candidate.length <= 60) {
      references.push(candidate);
    }
  }

  return [...new Set(references)];
}

/**
 * Classify an array of statuses, returning BookActivity items.
 */
export function classifyActivities(statuses: MastodonStatus[]): BookActivity[] {
  return statuses.map(classifyActivity);
}
