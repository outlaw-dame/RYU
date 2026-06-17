/**
 * Phase 16 — Entity resolution change handler.
 *
 * When entity resolution mappings change (e.g. a merge, deduplication,
 * or re-resolution), the associated entity's search document may have
 * stale metadata. We trigger a re-index of the resolved entity so
 * search stays consistent.
 *
 * This subscribes to `db.entityresolutions.$` and triggers a re-index
 * of the entity referenced by the resolution row.
 *
 * We intentionally do NOT remove the entity from search on resolution
 * DELETE — the entity itself still exists; only its resolution mapping
 * was removed. Deletion of the entity itself is handled by the existing
 * orama.ts reactive subscriptions for authors/works/editions/reviews.
 */

import type { RyuDatabase } from "../db/client";
import type { EntityResolutionDoc } from "../db/schema";
import { indexDocument } from "./vector-index";
import {
  authorDocToSearchDocument,
  editionDocToSearchDocument,
  reviewDocToSearchDocument,
  workDocToSearchDocument
} from "./search-document-projection";

const subscribedDatabases = new WeakSet<RyuDatabase>();

async function resolveAndReindex(db: RyuDatabase, entityType: string, entityId: string): Promise<void> {
  try {
    switch (entityType) {
      case "author": {
        const author = await db.authors.findOne(entityId).exec();
        if (author) await indexDocument(authorDocToSearchDocument(author), db);
        break;
      }
      case "work": {
        const work = await db.works.findOne(entityId).exec();
        if (work) await indexDocument(await workDocToSearchDocument(db, work), db);
        break;
      }
      case "edition": {
        const edition = await db.editions.findOne(entityId).exec();
        if (edition) await indexDocument(await editionDocToSearchDocument(db, edition), db);
        break;
      }
      case "review": {
        if (!db.reviews) break;
        const review = await db.reviews.findOne(entityId).exec();
        if (review) await indexDocument(await reviewDocToSearchDocument(db, review), db);
        break;
      }
    }
  } catch (error) {
    // Indexing failures are non-fatal — health repair will pick them up.
    console.error("Failed to re-index entity after resolution change", {
      entityType,
      entityId,
      error
    });
  }
}

/**
 * Subscribe to entity resolution changes so resolved entities stay
 * indexed with current metadata. Idempotent — multiple calls for the
 * same database instance are no-ops.
 *
 * Call once at DB initialization or Orama state creation.
 */
export function setupEntityResolutionIndexing(db: RyuDatabase): void {
  if (subscribedDatabases.has(db)) return;
  subscribedDatabases.add(db);

  const collection = (db as any).entityresolutions;
  if (!collection || typeof collection.$ === "undefined") return;

  collection.$.subscribe((change: any) => {
    const run = async () => {
      if (change.operation === "DELETE") {
        // Deletion of a resolution row does NOT mean the entity is gone.
        // The entity's own collection subscription handles that.
        return;
      }

      // INSERT or UPDATE — re-index the resolved entity.
      const docData: EntityResolutionDoc | undefined =
        change.documentData ?? change.previousDocumentData;
      if (!docData) return;

      await resolveAndReindex(db, docData.entityType, docData.entityId);
    };

    run().catch((error) => {
      console.error("Error in entity resolution indexing subscription", { change, error });
    });
  });
}
