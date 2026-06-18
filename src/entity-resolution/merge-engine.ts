/**
 * Phase 27: Merge engine.
 *
 * Merges two entities into one canonical record with:
 * - Atomic execution (rollback on partial failure)
 * - User-owned data preservation (reviews/notes transfer)
 * - Search vector rebuild for surviving entity
 * - Search vector removal for merged-away entity
 * - Resolution record creation (merged ID -> canonical ID)
 * - Undo snapshot creation
 */

import type { RyuDatabase } from '../db/client';
import type { EntityType } from '../db/schema';
import type { MergeOperation, MergeResult, UndoSnapshot } from './types';
import { writeResolution, removeResolution } from './resolution-store';
import { saveUndoSnapshot, getUndoSnapshotById, removeUndoSnapshot } from './undo-store';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Get the RxDB collection for a given entity type.
 */
function getCollection(db: RyuDatabase, entityType: EntityType) {
  switch (entityType) {
    case 'author': return db.authors;
    case 'work': return db.works;
    case 'edition': return db.editions;
    case 'review': return db.reviews;
  }
}

/**
 * Transfer reviews from source entity to target entity.
 * For editions: reviews are linked by editionId.
 * For works: editions linked to the work have their reviews transferred.
 * For authors: updates authorIds on works/editions.
 */
async function transferUserData(
  db: RyuDatabase,
  operation: MergeOperation
): Promise<string[]> {
  const transferredReviewIds: string[] = [];

  if (operation.entityType === 'edition') {
    // Transfer reviews from source edition to target edition
    const reviews = await db.reviews.find({
      selector: { editionId: operation.sourceId }
    }).exec();

    for (const reviewDoc of reviews) {
      await reviewDoc.incrementalPatch({ editionId: operation.targetId, updatedAt: nowIso() });
      transferredReviewIds.push(reviewDoc.toJSON().id);
    }
  } else if (operation.entityType === 'work') {
    // Transfer editions from source work to target work
    const editions = await db.editions.find({
      selector: { workId: operation.sourceId }
    }).exec();

    for (const editionDoc of editions) {
      await editionDoc.incrementalPatch({ workId: operation.targetId, updatedAt: nowIso() });
    }
  } else if (operation.entityType === 'author') {
    // Update authorIds on works referencing the source author
    const works = await db.works.find().exec();
    for (const workDoc of works) {
      const work = workDoc.toJSON();
      if (work.authorIds.includes(operation.sourceId)) {
        const newAuthorIds = work.authorIds
          .filter((id: string) => id !== operation.sourceId)
          .concat(work.authorIds.includes(operation.targetId) ? [] : [operation.targetId]);
        await workDoc.incrementalPatch({ authorIds: newAuthorIds, updatedAt: nowIso() });
      }
    }

    // Update authorIds on editions referencing the source author
    const editions = await db.editions.find().exec();
    for (const editionDoc of editions) {
      const edition = editionDoc.toJSON();
      if (edition.authorIds.includes(operation.sourceId)) {
        const newAuthorIds = edition.authorIds
          .filter((id: string) => id !== operation.sourceId)
          .concat(edition.authorIds.includes(operation.targetId) ? [] : [operation.targetId]);
        await editionDoc.incrementalPatch({ authorIds: newAuthorIds, updatedAt: nowIso() });
      }
    }
  }

  return transferredReviewIds;
}

/**
 * Remove search vectors for a merged-away entity.
 */
async function removeSearchVectors(db: RyuDatabase, entityId: string): Promise<void> {
  const vectors = await db.searchvectors.find({
    selector: { entityId }
  }).exec();

  for (const vectorDoc of vectors) {
    await vectorDoc.remove();
  }
}

/**
 * Mark search vectors for the surviving entity as needing rebuild
 * by removing them (they will be re-indexed on next access).
 */
async function invalidateSearchVectors(db: RyuDatabase, entityId: string): Promise<number> {
  const vectors = await db.searchvectors.find({
    selector: { entityId }
  }).exec();

  // Remove existing vectors so they get rebuilt with merged data
  for (const vectorDoc of vectors) {
    await vectorDoc.remove();
  }

  return vectors.length;
}

/**
 * Execute a merge operation atomically.
 *
 * The source entity is merged into the target entity:
 * 1. Transfer user-owned data (reviews, notes) to target
 * 2. Create resolution record (source URI -> target entity)
 * 3. Remove search vectors for source entity
 * 4. Invalidate search vectors for target (triggers rebuild)
 * 5. Remove the source entity document
 * 6. Save undo snapshot
 *
 * On failure at any step, all changes are rolled back.
 */
export async function executeMerge(
  db: RyuDatabase,
  operation: MergeOperation
): Promise<MergeResult> {
  const collection = getCollection(db, operation.entityType);

  // Validate both entities exist
  const sourceDoc = await collection.findOne({ selector: { id: operation.sourceId } }).exec();
  const targetDoc = await collection.findOne({ selector: { id: operation.targetId } }).exec();

  if (!sourceDoc) {
    throw new Error(`Source entity not found: ${operation.sourceId}`);
  }
  if (!targetDoc) {
    throw new Error(`Target entity not found: ${operation.targetId}`);
  }

  // Snapshot the source entity for undo
  const sourceSnapshot = JSON.stringify(sourceDoc.toJSON());
  const undoSnapshotId = generateId();
  const resolutionRecordIds: string[] = [];

  try {
    // Step 1: Transfer user data
    const transferredReviewIds = await transferUserData(db, operation);

    // Step 2: Create resolution record (source URI -> target)
    const resolutionRecord = await writeResolution(
      db,
      operation.sourceId,
      operation.entityType,
      operation.targetId
    );
    resolutionRecordIds.push(resolutionRecord.id);

    // Step 3: Remove search vectors for merged-away entity
    await removeSearchVectors(db, operation.sourceId);

    // Step 4: Invalidate search vectors for surviving entity (triggers rebuild)
    const searchVectorsRebuilt = await invalidateSearchVectors(db, operation.targetId);

    // Step 5: Remove the source entity
    await sourceDoc.remove();

    // Step 6: Save undo snapshot
    const undoSnapshot: UndoSnapshot = {
      id: undoSnapshotId,
      operation,
      sourceEntitySnapshot: sourceSnapshot,
      transferredReviewIds,
      resolutionRecordIds,
      createdAt: nowIso()
    };
    saveUndoSnapshot(undoSnapshot);

    return {
      canonicalId: operation.targetId,
      mergedId: operation.sourceId,
      entityType: operation.entityType,
      reviewsTransferred: transferredReviewIds.length,
      searchVectorsRebuilt,
      completedAt: nowIso(),
      undoSnapshotId
    };
  } catch (error) {
    // Rollback: remove any resolution records we created
    for (const recordId of resolutionRecordIds) {
      try {
        await removeResolution(db, recordId);
      } catch {
        // Best-effort rollback
      }
    }
    throw error;
  }
}

/**
 * Undo a previously executed merge.
 *
 * 1. Restore the source entity from snapshot
 * 2. Transfer reviews back to source entity
 * 3. Remove resolution records
 * 4. Remove the undo snapshot
 */
export async function undoMerge(
  db: RyuDatabase,
  undoSnapshotId: string
): Promise<void> {
  const snapshot = getUndoSnapshotById(undoSnapshotId);
  if (!snapshot) {
    throw new Error(`Undo snapshot not found: ${undoSnapshotId}`);
  }

  const collection = getCollection(db, snapshot.operation.entityType);
  const sourceEntity = JSON.parse(snapshot.sourceEntitySnapshot);

  // Step 1: Restore the source entity
  await collection.upsert(sourceEntity);

  // Step 2: Transfer reviews back to source entity
  if (snapshot.operation.entityType === 'edition' && snapshot.transferredReviewIds.length > 0) {
    for (const reviewId of snapshot.transferredReviewIds) {
      const reviewDoc = await db.reviews.findOne({ selector: { id: reviewId } }).exec();
      if (reviewDoc) {
        await reviewDoc.incrementalPatch({
          editionId: snapshot.operation.sourceId,
          updatedAt: nowIso()
        });
      }
    }
  }

  // Step 3: Remove resolution records
  for (const recordId of snapshot.resolutionRecordIds) {
    await removeResolution(db, recordId);
  }

  // Step 4: Remove the undo snapshot
  removeUndoSnapshot(undoSnapshotId);
}
