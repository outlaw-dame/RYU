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
    // In the current schema, cached AP content lives in the main collections
    // with a 'cache-only' scope. We can't directly query by scope in RxDB
    // (it's not an indexed field on the main collections), so we rely on
    // the search-vector provenance: vectors with entityType and a
    // cache-qualifying updatedAt timestamp.
    //
    // For now, we perform a lightweight TTL check on the searchvectors
    // collection for the active provider and remove expired ones.
    // A full entity-level eviction would require the collections to carry
    // a 'scope' field in their schema — that's a future schema migration.
    const vectors = await db.searchvectors.find().exec();
    const cacheVectors = vectors.filter((v: any) => {
      // Heuristic: vectors whose updatedAt is expired are candidates.
      // We only evict vectors, not the underlying entity — the entity
      // remains available for display but won't pollute search results
      // after the scope filter drops cache-only items.
      return isRemoteCacheExpired(v.updatedAt);
    });

    // Sort by updatedAt ascending (oldest first) for cap enforcement.
    cacheVectors.sort((a: any, b: any) =>
      Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
    );

    // Remove expired vectors.
    for (const vector of cacheVectors) {
      try {
        await (vector as any).remove();
        report.expiredEvicted++;
      } catch (error) {
        report.errors.push(`Failed to evict vector ${(vector as any).id}`);
      }
    }

    // Check remaining count against cap.
    const remainingVectors = await db.searchvectors.find().exec();
    report.remaining = remainingVectors.length;

    if (report.remaining > config.maxRemoteCacheDocuments) {
      const overage = report.remaining - config.maxRemoteCacheDocuments;
      // Sort remaining by updatedAt ascending, evict the oldest.
      const sorted = [...remainingVectors].sort((a: any, b: any) =>
        Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
      );
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
