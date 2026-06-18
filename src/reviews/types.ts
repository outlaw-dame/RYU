/**
 * Phase 29 - Review and note type definitions.
 *
 * Defines the domain types for local-first reviews, notes, and annotations
 * including visibility rules, draft states, and tombstone tracking.
 */

/**
 * Visibility determines how a review or note is handled:
 * - public: can be queued for remote publishing
 * - private: stored locally only, never leaves the device
 */
export type ReviewVisibility = 'public' | 'private';

/**
 * Lifecycle status of a review or note.
 * - draft: work in progress, not yet finalized
 * - published: finalized and either local-only (private) or queued for remote (public)
 * - deleted: tombstoned, content cleared, excluded from search
 */
export type ReviewStatus = 'draft' | 'published' | 'deleted';

/**
 * Content type discriminator.
 * - review: full-form review with optional rating
 * - note: lighter annotation or quick thought
 */
export type ReviewContentType = 'review' | 'note';

/**
 * A local review or note document.
 */
export interface LocalReview {
  id: string;
  editionId: string;
  userId: string;
  contentType: ReviewContentType;
  title: string;
  content: string;
  rating: number | null;
  visibility: ReviewVisibility;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp when the item was soft-deleted (tombstoned). Null if not deleted. */
  deletedAt: string | null;
}

/**
 * Tombstone record. Used to prevent deleted content from resurrecting
 * through search/index repair or sync operations.
 */
export interface ReviewTombstone {
  id: string;
  editionId: string;
  userId: string;
  deletedAt: string;
}

/**
 * Draft state persisted to localStorage for auto-save / recovery.
 */
export interface ReviewDraft {
  id: string;
  editionId: string;
  userId: string;
  contentType: ReviewContentType;
  title: string;
  content: string;
  rating: number | null;
  visibility: ReviewVisibility;
  savedAt: string;
}

/**
 * Publish queue entry for reviews that should be sent to a remote server.
 */
export interface PublishQueueEntry {
  id: string;
  reviewId: string;
  editionId: string;
  userId: string;
  action: 'create' | 'update' | 'delete';
  payload: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  enqueuedAt: string;
  updatedAt: string;
  error: string | null;
}
