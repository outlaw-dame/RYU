/**
 * Phase 34 - useDiscovery hook.
 *
 * Combines recommendation sources into a local-first discovery feed while
 * honoring both the established legacy controls and durable account-scoped
 * user signals when an authenticated Mastodon session is available.
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
import {
  buildUserSignalScopeFromSession,
  loadDiscoveryExclusionIds,
  recordDiscoveryNotInterested
} from "../recommendations/discovery-signal-runtime";
import { isSearchFeatureEnabled } from "../search/release/featureFlags";
import { useMastodonSession } from "../sync/use-mastodon-activity";

export type DiscoveryState = {
  recommendations: Recommendation[];
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

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  const controls = useMemo(() => getDiscoveryControls(), [version]);
  const userSignalScope = useMemo(
    () => buildUserSignalScopeFromSession(sessionQuery.data),
    [sessionQuery.data]
  );

  const refresh = useCallback(async () => {
    const currentControls = getDiscoveryControls();
    if (!currentControls.enabled || !isSearchFeatureEnabled("personalization")) {
      setRecommendations([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let durableExcludedIds: string[] = [];
      if (userSignalScope) {
        try {
          durableExcludedIds = await loadDiscoveryExclusionIds(userSignalScope);
        } catch {
          // Local persistence is additive at this stage. Continue with the
          // established localStorage controls rather than breaking discovery.
          durableExcludedIds = [];
        }
      }

      const excludeIds = [...new Set([
        ...currentControls.excludedIds,
        ...durableExcludedIds
      ])];
      const results: Recommendation[] = [];
      const settled = await Promise.allSettled([
        editionId
          ? findRelatedBooks(editionId, { limit: Math.ceil(limit / 3), excludeIds })
          : Promise.resolve([]),
        findSimilarAuthors({ limit: Math.ceil(limit / 4), excludeIds }),
        findBecauseYouRead({ limit: Math.ceil(limit / 2), excludeIds })
      ]);

      results.push(
        ...(settled[0].status === "fulfilled" ? settled[0].value : []),
        ...(settled[1].status === "fulfilled" ? settled[1].value : []),
        ...(settled[2].status === "fulfilled" ? settled[2].value : [])
      );

      const seen = new Set<string>();
      const excludedSet = new Set(excludeIds);
      const unique = results.filter((recommendation) => {
        if (seen.has(recommendation.id) || excludedSet.has(recommendation.id)) return false;
        seen.add(recommendation.id);
        return true;
      });

      setRecommendations(
        unique.sort((a, b) => b.score - a.score).slice(0, limit)
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [editionId, limit, userSignalScope, version]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = setInterval(() => void refresh(), refreshInterval);
    return () => clearInterval(timer);
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

  const excludeRecommendation = useCallback((recommendation: Recommendation) => {
    setRecommendations((previous) => previous.filter((item) => item.id !== recommendation.id));
    setVersion((value) => value + 1);

    if (!userSignalScope) {
      excludeFromDiscoveryFn(recommendation.id);
      return;
    }

    void recordDiscoveryNotInterested(recommendation, userSignalScope).catch(() => {
      // The runtime writes the legacy fallback before durable persistence, so
      // this remains recoverable and a future refresh can retry migration.
    });
  }, [userSignalScope]);

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
    excludeRecommendation,
    reset
  };
}
