/**
 * Relationship hydration - bulk-fetch relationships for visible accounts.
 *
 * Whenever RYU shows remote accounts in bulk, this module fetches
 * relationships for visible account IDs and caches:
 * - muting, blocking, following, requested, domain_blocking, muting_expires_at
 *
 * Uses batching to avoid hammering the API.
 */

import type { PolicyRelationship } from "./policy-types";
import { normalizeMastodonRelationship } from "./policy-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RelationshipCache = Map<string, PolicyRelationship>;

export type RelationshipFetcher = (
  accountIds: string[]
) => Promise<Array<{
  id: string;
  following: boolean;
  followed_by: boolean;
  blocking: boolean;
  blocked_by: boolean;
  muting: boolean;
  muting_notifications: boolean;
  requested: boolean;
  requested_by?: boolean;
  domain_blocking: boolean;
  endorsed: boolean;
  note?: string;
  muting_expires_at?: string | null;
}>>;

export type HydrationOptions = {
  /** Maximum account IDs per batch. Mastodon recommends max 40. */
  batchSize?: number;
  /** Cache TTL in milliseconds. */
  cacheTtlMs?: number;
  /** Instance origin for relationship keys. */
  instanceOrigin: string;
  /** Owner account ID for the current user. */
  ownerAccountId: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Relationship Hydrator ────────────────────────────────────────────────────

/**
 * Create a relationship hydrator with internal caching.
 */
export function createRelationshipHydrator(
  fetcher: RelationshipFetcher,
  options: HydrationOptions
) {
  const cache: RelationshipCache = new Map();
  const cacheTimestamps = new Map<string, number>();
  const insertionOrder: string[] = [];
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const MAX_CACHE_ENTRIES = 1000;

  /**
   * Check if a cached entry is still valid.
   */
  function isCacheValid(accountId: string): boolean {
    const timestamp = cacheTimestamps.get(accountId);
    if (!timestamp) return false;
    return Date.now() - timestamp < cacheTtlMs;
  }

  /**
   * Get a cached relationship or undefined if not cached/expired.
   */
  function getCached(accountId: string): PolicyRelationship | undefined {
    if (!isCacheValid(accountId)) {
      cache.delete(accountId);
      cacheTimestamps.delete(accountId);
      return undefined;
    }
    return cache.get(accountId);
  }

  /**
   * Hydrate relationships for a list of account IDs.
   * Only fetches IDs not already in the cache.
   */
  async function hydrate(accountIds: string[]): Promise<PolicyRelationship[]> {
    // Dedupe and filter out already-cached valid entries
    const uniqueIds = [...new Set(accountIds)];
    const uncachedIds = uniqueIds.filter((id) => !isCacheValid(id));
    const results: PolicyRelationship[] = [];

    // Fetch uncached in batches
    if (uncachedIds.length > 0) {
      const batches: string[][] = [];
      for (let i = 0; i < uncachedIds.length; i += batchSize) {
        batches.push(uncachedIds.slice(i, i + batchSize));
      }

      const batchResults = await Promise.allSettled(
        batches.map((batch) => fetcher(batch))
      );

      for (const result of batchResults) {
        if (result.status !== "fulfilled") continue;
        for (const raw of result.value) {
          const normalized = normalizeMastodonRelationship(
            raw,
            options.instanceOrigin,
            options.ownerAccountId
          );
          cache.set(raw.id, normalized);
          cacheTimestamps.set(raw.id, Date.now());
          // Track insertion order for FIFO eviction
          const existingIdx = insertionOrder.indexOf(raw.id);
          if (existingIdx === -1) {
            insertionOrder.push(raw.id);
          }
        }
      }

      // FIFO eviction: remove oldest entries when over the limit
      while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = insertionOrder.shift();
        if (oldest) {
          cache.delete(oldest);
          cacheTimestamps.delete(oldest);
        } else {
          break;
        }
      }
    }

    // Collect all requested relationships from cache (only valid entries)
    for (const id of uniqueIds) {
      const valid = getCached(id);
      if (valid) {
        results.push(valid);
      }
    }

    return results;
  }

  /**
   * Get all cached relationships.
   */
  function getAllCached(): PolicyRelationship[] {
    const valid: PolicyRelationship[] = [];
    for (const [id, rel] of cache) {
      if (isCacheValid(id)) {
        valid.push(rel);
      }
    }
    return valid;
  }

  /**
   * Invalidate all cached relationships (e.g. after a block/mute action).
   */
  function invalidateAll(): void {
    cache.clear();
    cacheTimestamps.clear();
  }

  /**
   * Invalidate a specific account's cached relationship.
   */
  function invalidate(accountId: string): void {
    cache.delete(accountId);
    cacheTimestamps.delete(accountId);
  }

  return {
    hydrate,
    getCached,
    getAllCached,
    invalidate,
    invalidateAll
  };
}
