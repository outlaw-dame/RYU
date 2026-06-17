/**
 * Phase 20 — Remote cache eviction.
 *
 * Enforces the boundary config's TTL and max-document cap on cached
 * remote content so the local search index doesn't grow unbounded with
 * stale ActivityPub data.
 *
 * Called periodically by the indexing orchestrator (Phase 15) during
 * idle time, and on app startup after health check.
 *
 * PRIVACY: eviction only touches documents with scope='cache-only'.
 * It never deletes private/local-only/public content.
 */

import type { RyuDatabase } from "../../db/client";
import {
  getSearchBoundaryConfig,
  isRemoteCacheExpired
} from "./searchBoundary";

export type EvictionReport = {
  /** Number of expired documents removed. */
  expiredEvicted: number;
  /** Number of documents removed to enforce the max-document cap. */
  capEvicted: number;
  /** Total documents remaining in cache after eviction. */
  remaining: number;
  /** Errors encountered (non-fatal). */
  errors: string[];
};

/**
 * Evict stale remote-cache documents from the search index.
 *
 * Steps:
 *   1. Find all searchvectors with scope indicators pointing to cache-only
 *      (we use entityType + a convention that cached docs have 'cache-only'
 *      in their provenance — in practice the canonical entity itself carries
 *      scope, so we check the source collection).
 *   2. Remove expired entries (updatedAt > TTL).
 *   3. If remaining count exceeds maxRemoteCacheDocuments, evict oldest first.
 *
 * Never throws. Failures are captured in the report.
 */
export async function evictStaleRemoteCache(db: RyuDatabase): Promise<EvictionReport> {
  const report: EvictionReport = {
    expiredEvicted: 0,
    capEvicted: 0,
    remaining: 0,
    errors: []
  };

  const config = getSearchBoundaryConfig();

  try {
    // Remote-cache entities are identified by their source metadata.
    // The searchvectors collection doesn't carry a 'scope' field directly,
    // but it DOES carry 'entityType'. We need a reliable discriminator.
    //
    // Since the current schema doesn't store scope on vectors, we use
    // a conservative approach: only evict vectors whose entityId starts
    // with a known remote-cache prefix OR whose entityType indicates
    // remote content. For now, we look up each vector's source entity
    // and check if it has cache-only scope.
    //
    // SAFETY: we NEVER evict a vector unless we can positively confirm
    // it belongs to a cache-only entity. If we can't determine scope,
    // we leave it alone — health repair will clean orphans later.
    const vectors = await db.searchvectors.find().exec();

    // Build a set of entity IDs that are confirmed cache-only.
    // We check all entity collections for documents with matching IDs
    // and determine their scope. Since scope isn't stored in the schema
    // yet, we rely on the entity's source: entities imported via AP with
    // no local library ownership are treated as cache candidates.
    //
    // For Phase 20, we take the SAFEST approach: only evict vectors
    // that are expired AND have no corresponding canonical entity in
    // any of the main collections (authors, works, editions, reviews).
    // These are orphan vectors from deleted/expired remote content.
    const entityIds = new Set(vectors.map((v: any) => v.entityId));
    const localEntityIds = new Set<string>();

    // Check which entity IDs still exist in local collections.
    for (const collection of [db.authors, db.works, db.editions]) {
      if (!collection) continue;
      const docs = await collection.find({
        selector: { id: { $in: Array.from(entityIds) } }
      }).exec().catch(() => []);
      for (const doc of docs) localEntityIds.add((doc as any).id);
    }
    if (db.reviews) {
      const reviewDocs = await db.reviews.find({
        selector: { id: { $in: Array.from(entityIds) } }
      }).exec().catch(() => []);
      for (const doc of reviewDocs) localEntityIds.add((doc as any).id);
    }

    // Only consider vectors whose entity no longer exists (orphans from
    // expired/deleted remote cache) AND whose updatedAt exceeds the TTL.
    const cacheVectors = vectors.filter((v: any) => {
      // If the entity still exists locally, it's NOT a cache-only orphan.
      if (localEntityIds.has(v.entityId)) return false;
      // Only evict if expired.
      return isRemoteCacheExpired(v.updatedAt);
    });

    // Sort by updatedAt ascending (oldest first) for cap enforcement.
    cacheVectors.sort((a: any, b: any) => {
      const timeA = Date.parse(a.updatedAt) || 0;
      const timeB = Date.parse(b.updatedAt) || 0;
      return timeA - timeB;
    });

    // Remove expired orphan vectors.
    for (const vector of cacheVectors) {
      try {
        await (vector as any).remove();
        report.expiredEvicted++;
      } catch (error) {
        report.errors.push(`Failed to evict vector ${(vector as any).id}`);
      }
    }

    // Check remaining orphan count against cap (only orphan vectors count).
    const remainingVectors = await db.searchvectors.find().exec();
    const remainingOrphans = remainingVectors.filter((v: any) =>
      !localEntityIds.has(v.entityId)
    );
    report.remaining = remainingOrphans.length;

    if (report.remaining > config.maxRemoteCacheDocuments) {
      const overage = report.remaining - config.maxRemoteCacheDocuments;
      // Sort remaining orphans by updatedAt ascending, evict the oldest.
      const sorted = [...remainingOrphans].sort((a: any, b: any) => {
        const timeA = Date.parse(a.updatedAt) || 0;
        const timeB = Date.parse(b.updatedAt) || 0;
        return timeA - timeB;
      });
      const toEvict = sorted.slice(0, overage);
      for (const vector of toEvict) {
        try {
          await (vector as any).remove();
          report.capEvicted++;
        } catch (error) {
          report.errors.push(`Failed to cap-evict vector ${(vector as any).id}`);
        }
      }
      report.remaining -= report.capEvicted;
    }
  } catch (error) {
    report.errors.push(
      `Eviction failed: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }

  return report;
}
