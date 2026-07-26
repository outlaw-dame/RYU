/**
 * Phase 34 - useDiscovery hook.
 * Combines recommendation sources under the authenticated owner's controls.
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
import {
  scoreAndFilterRecommendations,
  type ScoredRecommendation
} from "../recommendations/unified-scorer";
import { recommendationSignalStorageKey } from "../recommendations/signal-store";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { useMastodonSession } from "../sync/use-mastodon-activity";

const RECOMMENDATION_SIGNAL_SYNC_EVENT = "ryu:recommendation-signals-sync";

export type DiscoveryState = {
  recommendations: ScoredRecommendation[];
  loading: boolean;
  error: Error | null;
  enabled: boolean;
};

export type UseDiscoveryOptions = {
  editionId?: string | null;
  limit?: number;
  refreshInterval?: number;
};

export function useDiscovery(options: UseDiscoveryOptions = {}) {
  const { editionId = null, limit = 20, refreshInterval = 0 } = options;
  const sessionQuery = useMastodonSession();
  const ownerAccountId = useMemo(
    () => buildModerationOwnerIdentity(sessionQuery.data),
    [sessionQuery.data]
  );

  const [recommendations, setRecommendations] = useState<ScoredRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);
  const controls = useMemo(() => getDiscoveryControls(), [version]);

  const refresh = useCallback(async () => {
    const currentControls = getDiscoveryControls();
    if (!currentControls.enabled || !ownerAccountId ||
        !isSearchFeatureEnabled("personalization")) {
      setRecommendations([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const excludeIds = currentControls.excludedIds;
      const engineOptions = { ownerAccountId };
      const settled = await Promise.allSettled([
        editionId
          ? findRelatedBooks(editionId, {
              limit: Math.ceil(limit / 3),
              excludeIds,
              ...engineOptions
            })
          : Promise.resolve([]),
        findSimilarAuthors({
          limit: Math.ceil(limit / 4),
          excludeIds,
          ...engineOptions
        }),
        findBecauseYouRead({
          limit: Math.ceil(limit / 2),
          excludeIds,
          ...engineOptions
        })
      ]);

      const results: Recommendation[] = [];
      const engineNames = ["Related Books", "Similar Authors", "Because You Read"];
      for (let index = 0; index < settled.length; index++) {
        const result = settled[index];
        if (result.status === "fulfilled") results.push(...result.value);
        else console.warn(`[discovery] ${engineNames[index]} engine failed:`, result.reason);
      }

      const seen = new Set<string>();
      const excludedSet = new Set(currentControls.excludedIds);
      const unique = results.filter((recommendation) => {
        if (seen.has(recommendation.id) || excludedSet.has(recommendation.id)) return false;
        seen.add(recommendation.id);
        return true;
      });

      setRecommendations(
        scoreAndFilterRecommendations(unique, ownerAccountId).slice(0, limit)
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [editionId, limit, ownerAccountId, version]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Recommendation controls dispatch a same-tab invalidation event. Storage
  // events cover other tabs. Both are owner-scoped before triggering a refresh.
  useEffect(() => {
    if (!ownerAccountId) return;
    const expectedStorageKey = recommendationSignalStorageKey(ownerAccountId);
    const handleSignalChange = () => setVersion((value) => value + 1);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === expectedStorageKey) handleSignalChange();
    };

    window.addEventListener(RECOMMENDATION_SIGNAL_SYNC_EVENT, handleSignalChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(RECOMMENDATION_SIGNAL_SYNC_EVENT, handleSignalChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [ownerAccountId]);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = window.setInterval(() => void refresh(), refreshInterval);
    return () => window.clearInterval(timer);
  }, [refresh, refreshInterval]);

  const setEnabled = useCallback((enabled: boolean) => {
    setDiscoveryControls({ enabled });
    setVersion((value) => value + 1);
  }, []);

  const excludeItem = useCallback((entityId: string) => {
    excludeFromDiscoveryFn(entityId);
    setRecommendations((previous) => previous.filter((item) => item.id !== entityId));
    setVersion((value) => value + 1);
  }, []);

  const reset = useCallback(() => {
    resetDiscoveryControls();
    setVersion((value) => value + 1);
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
