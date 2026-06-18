/**
 * Phase 27: Entity resolution types.
 *
 * Defines merge operations, resolution records, and undo snapshots
 * for canonical book entity resolution.
 */

import type { EntityType } from '../db/schema';

/** Direction of a merge: source entity merges INTO target (canonical). */
export interface MergeOperation {
  /** The entity that will be kept (canonical/surviving entity). */
  targetId: string;
  /** The entity that will be merged away (alias). */
  sourceId: string;
  /** Type of entity being merged. */
  entityType: EntityType;
  /** Timestamp when merge was initiated. */
  initiatedAt: string;
}

/** Result of a successful merge. */
export interface MergeResult {
  /** The surviving canonical entity ID. */
  canonicalId: string;
  /** The merged-away entity ID. */
  mergedId: string;
  /** Entity type. */
  entityType: EntityType;
  /** Number of reviews transferred to the surviving entity. */
  reviewsTransferred: number;
  /** Number of search vectors rebuilt. */
  searchVectorsRebuilt: number;
  /** Timestamp of merge completion. */
  completedAt: string;
  /** Undo snapshot ID for reversal. */
  undoSnapshotId: string;
}

/** Snapshot stored for undo support. */
export interface UndoSnapshot {
  /** Unique ID for this snapshot. */
  id: string;
  /** The merge operation that produced this snapshot. */
  operation: MergeOperation;
  /** Serialized state of the source entity before merge. */
  sourceEntitySnapshot: string;
  /** IDs of reviews that were transferred. */
  transferredReviewIds: string[];
  /** IDs of entity resolution records created. */
  resolutionRecordIds: string[];
  /** Timestamp of snapshot creation. */
  createdAt: string;
}

/** A candidate pair for merging (used by the UI/hook layer). */
export interface MergeCandidate {
  /** First entity ID. */
  entityA: string;
  /** Second entity ID. */
  entityB: string;
  /** Entity type. */
  entityType: EntityType;
  /** Confidence score (0-1) of the match. */
  confidence: number;
  /** Reason for the suggested merge. */
  reason: 'uri_match' | 'isbn_match' | 'title_author_match' | 'author_alias';
}

/** Resolution record mapping an alias URI to a canonical entity. */
export interface ResolutionRecord {
  id: string;
  canonicalUri: string;
  entityType: EntityType;
  entityId: string;
  resolvedAt: string;
}
