/**
 * Phase 34 - useDiscovery hook.
 *
 * Combines all recommendation sources (related books, similar authors,
 * reading history) into a single discovery feed. Respects user controls
 * and feature flags.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  findBecauseYouRead,
  findRelatedBooks,
  findSimilarAuthors,
  getDiscoveryControls,
  resetDiscoveryControls,
  setDiscoveryControls,
  excludeFromDiscovery as excludeFromDiscoveryFn,
  type Recommendation
} from "../discovery";
import { isSearchFeatureEnabled } from "../search/release/featureFlags";

export type DiscoveryState = {
  recommendations: Recommendation[];
  loading: boolean;
  error: Error | null;
  enabled: boolean;
};

export type UseDiscoveryOptions = {
  /** Specific edition to find related books for (optional). */
  editionId?: string | null;
  /** Maximum total recommendations to return. */
  limit?: number;
  /** Auto-refresh interval in milliseconds (0 to disable). */
  refreshInterval?: number;
};

export function useDiscovery(options: UseDiscoveryOptions = {}) {
  const { editionId = null, limit = 20, refreshInterval = 0 } = options;

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  const controls = useMemo(() => getDiscoveryControls(), [version]);

  const refresh = useCallback(async () => {
    const currentControls = getDiscoveryControls();

    if (!currentControls.enabled) {
      setRecommendations([]);
      return;
    }

    // Check feature flag for personalization
    if (!isSearchFeatureEnabled("personalization")) {
      setRecommendations([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const excludeIds = currentControls.excludedIds;
      const results: Recommendation[] = [];

      // Gather recommendations from all sources in parallel
      const settled = await Promise.allSettled([
        editionId
          ? findRelatedBooks(editionId, { limit: Math.ceil(limit / 3), excludeIds })
          : Promise.resolve([]),
        findSimilarAuthors({ limit: Math.ceil(limit / 4), excludeIds }),
        findBecauseYouRead({ limit: Math.ceil(limit / 2), excludeIds })
      ]);

      const relatedBooks = settled[0].status === "fulfilled" ? settled[0].value : [];
      const similarAuthors = settled[1].status === "fulfilled" ? settled[1].value : [];
      const becauseYouRead = settled[2].status === "fulfilled" ? settled[2].value : [];

      // Log any failed discovery engines for debuggability.
      const engineNames = ["Related Books", "Similar Authors", "Because You Read"];
      for (let i = 0; i < settled.length; i++) {
        if (settled[i].status === "rejected") {
          console.warn(`[discovery] ${engineNames[i]} engine failed:`, (settled[i] as PromiseRejectedResult).reason);
        }
      }

      results.push(...relatedBooks, ...similarAuthors, ...becauseYouRead);

      // Deduplicate by ID
      const seen = new Set<string>();
      const excludedSet = new Set(currentControls.excludedIds);
      const unique = results.filter((rec) => {
        if (seen.has(rec.id) || excludedSet.has(rec.id)) {
          return false;
        }
        seen.add(rec.id);
        return true;
      });

      // Sort by score descending and limit
      const sorted = unique
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      setRecommendations(sorted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [editionId, limit, version]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Optional auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = setInterval(() => {
      void refresh();
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [refresh, refreshInterval]);

  const setEnabled = useCallback((enabled: boolean) => {
    setDiscoveryControls({ enabled });
    setVersion((v) => v + 1);
  }, []);

  const excludeItem = useCallback((entityId: string) => {
    excludeFromDiscoveryFn(entityId);
    setRecommendations((prev) => prev.filter((r) => r.id !== entityId));
    setVersion((v) => v + 1);
  }, []);

  const reset = useCallback(() => {
    resetDiscoveryControls();
    setVersion((v) => v + 1);
  }, []);

  return {
    recommendations,
    loading,
    error,
    enabled: controls.enabled,
    refresh,
    setEnabled,
    excludeItem,
    reset
  };
}
