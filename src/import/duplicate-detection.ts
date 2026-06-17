/**
 * Phase 26: Duplicate detection for import hardening.
 *
 * Checks whether an edition already exists in the local database by:
 * 1. Canonical URI (exact match on entity resolution)
 * 2. ISBN-13 or ISBN-10 (exact match on editions)
 * 3. Normalized title + author combination (fuzzy match)
 */

import { initializeDatabase } from '../db/client';

export type DuplicateCheckResult =
  | { isDuplicate: false }
  | { isDuplicate: true; existingId: string; matchType: 'uri' | 'isbn' | 'title_author' };

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]/gu, '')
    .trim();
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

/**
 * Check if a URI already exists in entity resolutions.
 */
export async function checkDuplicateByUri(uri: string): Promise<DuplicateCheckResult> {
  const db = await initializeDatabase();
  const existing = await db.entityresolutions.findOne({
    selector: { canonicalUri: uri }
  }).exec();

  if (existing) {
    const doc = existing.toJSON();
    return { isDuplicate: true, existingId: doc.entityId, matchType: 'uri' };
  }

  return { isDuplicate: false };
}

/**
 * Check if an ISBN already exists in the editions collection.
 */
export async function checkDuplicateByIsbn(isbn: string): Promise<DuplicateCheckResult> {
  const normalized = normalizeIsbn(isbn);
  if (!normalized || (normalized.length !== 10 && normalized.length !== 13)) {
    return { isDuplicate: false };
  }

  const db = await initializeDatabase();

  const field = normalized.length === 13 ? 'isbn13' : 'isbn10';
  const editions = await db.editions.find({
    selector: { [field]: normalized }
  }).exec();

  if (editions.length > 0) {
    const doc = editions[0].toJSON();
    return { isDuplicate: true, existingId: doc.id, matchType: 'isbn' };
  }

  // Also check the other ISBN field in case of cross-format match
  const altField = normalized.length === 13 ? 'isbn10' : 'isbn13';
  const altEditions = await db.editions.find({
    selector: { [altField]: normalized }
  }).exec();

  if (altEditions.length > 0) {
    const doc = altEditions[0].toJSON();
    return { isDuplicate: true, existingId: doc.id, matchType: 'isbn' };
  }

  return { isDuplicate: false };
}

/**
 * Check if a title+author combination already exists in the editions collection.
 * Uses normalized comparison to handle minor differences in capitalization/punctuation.
 */
export async function checkDuplicateByTitleAuthor(
  title: string,
  authorName?: string
): Promise<DuplicateCheckResult> {
  const normalizedTitle = normalizeForComparison(title);
  if (!normalizedTitle || normalizedTitle.length < 3) {
    return { isDuplicate: false };
  }

  const db = await initializeDatabase();
  const editions = await db.editions.find().exec();

  for (const editionDoc of editions) {
    const edition = editionDoc.toJSON();
    const editionNormTitle = normalizeForComparison(edition.title);

    if (editionNormTitle !== normalizedTitle) {
      continue;
    }

    // Title matches; if no author provided, count as duplicate
    if (!authorName) {
      return { isDuplicate: true, existingId: edition.id, matchType: 'title_author' };
    }

    // Check author match
    const normalizedAuthor = normalizeForComparison(authorName);
    if (!normalizedAuthor) {
      return { isDuplicate: true, existingId: edition.id, matchType: 'title_author' };
    }

    // Look up authors for this edition
    const authors = await db.authors.findByIds([...edition.authorIds]).exec();
    const authorNames = [...authors.values()].map((a) => normalizeForComparison((a.toJSON() as { name: string }).name));

    const authorMatches = authorNames.some((name) =>
      name === normalizedAuthor || name.includes(normalizedAuthor) || normalizedAuthor.includes(name)
    );

    if (authorMatches) {
      return { isDuplicate: true, existingId: edition.id, matchType: 'title_author' };
    }
  }

  return { isDuplicate: false };
}

/**
 * Run all duplicate checks for a given import input.
 * Returns on the first match found (short-circuits).
 */
export async function detectDuplicate(params: {
  uri?: string;
  isbn?: string;
  title?: string;
  authorName?: string;
}): Promise<DuplicateCheckResult> {
  // Check URI first (cheapest, most reliable)
  if (params.uri) {
    const uriResult = await checkDuplicateByUri(params.uri);
    if (uriResult.isDuplicate) return uriResult;
  }

  // Check ISBN (second most reliable)
  if (params.isbn) {
    const isbnResult = await checkDuplicateByIsbn(params.isbn);
    if (isbnResult.isDuplicate) return isbnResult;
  }

  // Check title+author (least reliable, most expensive)
  if (params.title) {
    const titleResult = await checkDuplicateByTitleAuthor(params.title, params.authorName);
    if (titleResult.isDuplicate) return titleResult;
  }

  return { isDuplicate: false };
}
