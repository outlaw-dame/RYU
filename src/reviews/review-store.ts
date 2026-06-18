/**
 * Phase 29 - Review store.
 *
 * CRUD operations for reviews and notes in the local RxDB database.
 * Handles create, update, soft-delete with tombstone, and listing by edition.
 * Integrates with the search index to keep content discoverable (or removed on delete).
 */

import { initializeDatabase } from '../db/client';
import { removeFromInMemoryVectorIndex } from '../search/vector-index';
import type { LocalReview, ReviewContentType, ReviewVisibility } from './types';

const REVIEW_COLLECTION = 'reviews';

function generateId(): string {
  return `local-review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export interface CreateReviewInput {
  editionId: string;
  userId: string;
  contentType: ReviewContentType;
  title?: string;
  content: string;
  rating?: number | null;
  visibility: ReviewVisibility;
}

export interface UpdateReviewInput {
  title?: string;
  content?: string;
  rating?: number | null;
  visibility?: ReviewVisibility;
}

/**
 * Creates a new review or note and inserts it into RxDB.
 */
export async function createReview(input: CreateReviewInput): Promise<LocalReview> {
  const db = await initializeDatabase();
  const now = nowISO();
  const id = generateId();

  const doc = {
    id,
    title: input.title ?? '',
    content: input.content,
    editionId: input.editionId,
    accountId: input.userId,
    rating: input.rating ?? undefined,
    contentType: input.contentType,
    visibility: input.visibility,
    published: now,
    importedAt: now,
    updatedAt: now
  };

  await db[REVIEW_COLLECTION].upsert(doc);

  return {
    id,
    editionId: input.editionId,
    userId: input.userId,
    contentType: input.contentType,
    title: input.title ?? '',
    content: input.content,
    rating: input.rating ?? null,
    visibility: input.visibility,
    status: 'published',
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
}

/**
 * Updates an existing review's content, rating, or visibility.
 */
export async function updateReview(reviewId: string, input: UpdateReviewInput): Promise<LocalReview | null> {
  const db = await initializeDatabase();
  const existingDoc = await db[REVIEW_COLLECTION].findOne(reviewId).exec();

  if (!existingDoc) {
    return null;
  }

  const now = nowISO();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (input.title !== undefined) updates.title = input.title;
  if (input.content !== undefined) updates.content = input.content;
  if (input.rating !== undefined) updates.rating = input.rating ?? undefined;
  if (input.visibility !== undefined) updates.visibility = input.visibility;

  await existingDoc.incrementalPatch(updates);

  const updated = existingDoc.toJSON() as any;

  return {
    id: updated.id,
    editionId: updated.editionId,
    userId: updated.accountId,
    contentType: (updated.contentType as ReviewContentType) ?? 'review',
    title: updated.title ?? '',
    content: updated.content,
    rating: updated.rating ?? null,
    visibility: (updated.visibility as ReviewVisibility) ?? 'public',
    status: 'published',
    createdAt: updated.importedAt,
    updatedAt: updated.updatedAt,
    deletedAt: null
  };
}

/**
 * Soft-deletes a review by tombstoning it.
 * Clears content to prevent data leakage and removes from search index.
 * The tombstone prevents resurrection through index repair.
 */
export async function deleteReview(reviewId: string): Promise<boolean> {
  const db = await initializeDatabase();
  const doc = await db[REVIEW_COLLECTION].findOne(reviewId).exec();

  if (!doc) {
    return false;
  }

  // Remove from search indexes first
  removeFromInMemoryVectorIndex(reviewId);

  // Remove the document from RxDB entirely
  await doc.remove();

  // Store tombstone in localStorage to prevent resurrection
  storeTombstone(reviewId);

  return true;
}

/**
 * Returns all non-deleted reviews for a given edition.
 */
export async function listReviewsByEdition(editionId: string): Promise<LocalReview[]> {
  const db = await initializeDatabase();
  const docs = await db[REVIEW_COLLECTION].find({
    selector: { editionId }
  }).exec();

  const tombstones = getTombstones();

  return docs
    .filter((doc: any) => !tombstones.has(doc.id))
    .map((doc: any) => {
      const plain = doc.toJSON();
      return {
        id: plain.id,
        editionId: plain.editionId,
        userId: plain.accountId,
        contentType: (plain.contentType as ReviewContentType) ?? 'review',
        title: plain.title ?? '',
        content: plain.content,
        rating: plain.rating ?? null,
        visibility: (plain.visibility as ReviewVisibility) ?? 'public',
        status: 'published' as const,
        createdAt: plain.importedAt,
        updatedAt: plain.updatedAt,
        deletedAt: null
      };
    });
}

/**
 * Gets a single review by ID.
 */
export async function getReviewById(reviewId: string): Promise<LocalReview | null> {
  const db = await initializeDatabase();
  const doc = await db[REVIEW_COLLECTION].findOne(reviewId).exec();

  if (!doc) return null;

  const tombstones = getTombstones();
  if (tombstones.has(reviewId)) return null;

  const plain = doc.toJSON() as any;
  return {
    id: plain.id,
    editionId: plain.editionId,
    userId: plain.accountId,
    contentType: (plain.contentType as ReviewContentType) ?? 'review',
    title: plain.title ?? '',
    content: plain.content,
    rating: plain.rating ?? null,
    visibility: (plain.visibility as ReviewVisibility) ?? 'public',
    status: 'published',
    createdAt: plain.importedAt,
    updatedAt: plain.updatedAt,
    deletedAt: null
  };
}

// --- Tombstone persistence (localStorage) ---

const TOMBSTONE_KEY = 'ryu.review-tombstones';

function storeTombstone(reviewId: string): void {
  try {
    const existing = getTombstoneEntries();
    existing[reviewId] = new Date().toISOString();
    window.localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(existing));
  } catch {
    // Best-effort tombstone persistence
  }
}

function getTombstoneEntries(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getTombstones(): Set<string> {
  return new Set(Object.keys(getTombstoneEntries()));
}

/**
 * Check if a review ID is tombstoned (was deleted).
 * Used by search/index repair to skip deleted content.
 */
export function isTombstoned(reviewId: string): boolean {
  return getTombstones().has(reviewId);
}
