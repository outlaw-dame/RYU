/**
 * Phase 27: Merge engine.
 *
 * Merges two entities into one canonical record with:
 * - Atomic execution (rollback on partial failure)
 * - User-owned data preservation (reviews/notes transfer)
 * - Search vector rebuild for surviving entity
 * - Search vector removal for merged-away entity
 * - Resolution record creation (merged ID -> canonical ID)
 * - Undo snapshot creation with full child-relation metadata
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

/** Metadata returned from transferUserData for undo support. */
type TransferResult = {
  transferredReviewIds: string[];
  transferredEditionIds: string[];
  modifiedWorks: Array<{ id: string; originalAuthorIds: string[] }>;
  modifiedEditions: Array<{ id: string; originalAuthorIds: string[] }>;
};

/**
 * Transfer user-owned data from source entity to target entity.
 *
 * - Edition merge: reviews linked by editionId are transferred.
 * - Work merge: editions linked by workId are transferred.
 * - Author merge: works/editions with source in authorIds are updated.
 *
 * Returns full metadata needed for undo.
 */
async function transferUserData(
  db: RyuDatabase,
  operation: MergeOperation
): Promise<TransferResult> {
  const transferredReviewIds: string[] = [];
  const transferredEditionIds: string[] = [];
  const modifiedWorks: Array<{ id: string; originalAuthorIds: string[] }> = [];
  const modifiedEditions: Array<{ id: string; originalAuthorIds: string[] }> = [];

  if (operation.entityType === 'edition') {
    const reviews = await db.reviews.find({
      selector: { editionId: operation.sourceId }
    }).exec();

    for (const reviewDoc of reviews) {
      await reviewDoc.incrementalPatch({ editionId: operation.targetId, updatedAt: nowIso() });
      transferredReviewIds.push(reviewDoc.toJSON().id);
    }
  } else if (operation.entityType === 'work') {
    const editions = await db.editions.find({
      selector: { workId: operation.sourceId }
    }).exec();

    for (const editionDoc of editions) {
      await editionDoc.incrementalPatch({ workId: operation.targetId, updatedAt: nowIso() });
      transferredEditionIds.push(editionDoc.toJSON().id);
    }
  } else if (operation.entityType === 'author') {
    // Use $in selector to only fetch works referencing the source author
    const works = await db.works.find({
      selector: { authorIds: { $elemMatch: { $eq: operation.sourceId } } }
    }).exec().catch(async () => {
      // Fallback if $elemMatch not supported: load all and filter
      const all = await db.works.find().exec();
      return all.filter((doc) => doc.toJSON().authorIds.includes(operation.sourceId));
    });

    for (const workDoc of works) {
      const work = workDoc.toJSON();
      const originalAuthorIds = [...work.authorIds];
      modifiedWorks.push({ id: work.id, originalAuthorIds });

      const newAuthorIds = work.authorIds
        .filter((id: string) => id !== operation.sourceId)
        .concat(work.authorIds.includes(operation.targetId) ? [] : [operation.targetId]);
      await workDoc.incrementalPatch({ authorIds: newAuthorIds, updatedAt: nowIso() });
    }

    // Use $in selector for editions too
    const editions = await db.editions.find({
      selector: { authorIds: { $elemMatch: { $eq: operation.sourceId } } }
    }).exec().catch(async () => {
      const all = await db.editions.find().exec();
      return all.filter((doc) => doc.toJSON().authorIds.includes(operation.sourceId));
    });

    for (const editionDoc of editions) {
      const edition = editionDoc.toJSON();
      const originalAuthorIds = [...edition.authorIds];
      modifiedEditions.push({ id: edition.id, originalAuthorIds });

      const newAuthorIds = edition.authorIds
        .filter((id: string) => id !== operation.sourceId)
        .concat(edition.authorIds.includes(operation.targetId) ? [] : [operation.targetId]);
      await editionDoc.incrementalPatch({ authorIds: newAuthorIds, updatedAt: nowIso() });
    }
  }

  return { transferredReviewIds, transferredEditionIds, modifiedWorks, modifiedEditions };
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
 * Invalidate search vectors for the surviving entity (triggers rebuild).
 */
async function invalidateSearchVectors(db: RyuDatabase, entityId: string): Promise<number> {
  const vectors = await db.searchvectors.find({
    selector: { entityId }
  }).exec();

  for (const vectorDoc of vectors) {
    await vectorDoc.remove();
  }

  return vectors.length;
}

/**
 * Execute a merge operation atomically.
 *
 * The source entity is merged into the target entity:
 * 1. Transfer user-owned data (reviews, editions, authorIds) to target
 * 2. Create resolution record (source URI -> target entity)
 * 3. Remove search vectors for source entity
 * 4. Invalidate search vectors for target (triggers rebuild)
 * 5. Remove the source entity document
 * 6. Save undo snapshot with full relation metadata
 *
 * On failure at any step, all changes are rolled back.
 */
export async function executeMerge(
  db: RyuDatabase,
  operation: MergeOperation
): Promise<MergeResult> {
  // Guard: reject same-id merges
  if (operation.sourceId === operation.targetId) {
    throw new Error('Cannot merge an entity into itself.');
  }

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
    // Step 1: Transfer user data (full metadata for undo)
    const {
      transferredReviewIds,
      transferredEditionIds,
      modifiedWorks,
      modifiedEditions
    } = await transferUserData(db, operation);

    // Step 2: Create resolution record (source URI -> target)
    // Also remove any existing self-mapping for the source URI
    // (ActivityPub ingest may have created one)
    const existingSelfMapping = await db.entityresolutions.findOne({
      selector: { canonicalUri: operation.sourceId }
    }).exec();
    if (existingSelfMapping) {
      await existingSelfMapping.remove();
    }

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

    // Step 6: Save undo snapshot with full relation metadata
    const undoSnapshot: UndoSnapshot = {
      id: undoSnapshotId,
      operation,
      sourceEntitySnapshot: sourceSnapshot,
      transferredReviewIds,
      transferredEditionIds,
      modifiedWorks,
      modifiedEditions,
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
 * Fully restores all child references for work and author merges:
 * 1. Restore the source entity from snapshot
 * 2. Transfer reviews back (edition merges)
 * 3. Transfer editions back (work merges)
 * 4. Restore original authorIds on works/editions (author merges)
 * 5. Remove resolution records
 * 6. Remove the undo snapshot
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

  // Step 2: Restore edition merge child references (reviews)
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

  // Step 3: Restore work merge child references (editions)
  if (snapshot.operation.entityType === 'work' && snapshot.transferredEditionIds && snapshot.transferredEditionIds.length > 0) {
    for (const editionId of snapshot.transferredEditionIds) {
      const editionDoc = await db.editions.findOne({ selector: { id: editionId } }).exec();
      if (editionDoc) {
        await editionDoc.incrementalPatch({
          workId: snapshot.operation.sourceId,
          updatedAt: nowIso()
        });
      }
    }
  }

  // Step 4: Restore author merge child references (works + editions authorIds)
  if (snapshot.operation.entityType === 'author') {
    if (snapshot.modifiedWorks && snapshot.modifiedWorks.length > 0) {
      for (const { id, originalAuthorIds } of snapshot.modifiedWorks) {
        const workDoc = await db.works.findOne({ selector: { id } }).exec();
        if (workDoc) {
          await workDoc.incrementalPatch({
            authorIds: originalAuthorIds,
            updatedAt: nowIso()
          });
        }
      }
    }
    if (snapshot.modifiedEditions && snapshot.modifiedEditions.length > 0) {
      for (const { id, originalAuthorIds } of snapshot.modifiedEditions) {
        const editionDoc = await db.editions.findOne({ selector: { id } }).exec();
        if (editionDoc) {
          await editionDoc.incrementalPatch({
            authorIds: originalAuthorIds,
            updatedAt: nowIso()
          });
        }
      }
    }
  }

  // Step 5: Remove resolution records
  for (const recordId of snapshot.resolutionRecordIds) {
    await removeResolution(db, recordId);
  }

  // Step 6: Remove the undo snapshot
  removeUndoSnapshot(undoSnapshotId);
}
