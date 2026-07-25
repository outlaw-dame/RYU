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
import {
  setRecommendationFeedbackState,
  type RecommendationFeedbackState
} from "../recommendations/recommendation-feedback";
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
  const [feedbackPendingIds, setFeedbackPendingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [feedbackErrors, setFeedbackErrors] = useState<Readonly<Record<string, string>>>(() => ({}));

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

  const setRecommendationFeedback = useCallback(async (
    recommendation: Recommendation,
    state: RecommendationFeedbackState
  ): Promise<void> => {
    if (!userSignalScope) {
      if (state === "not_interested") {
        excludeRecommendation(recommendation);
        return;
      }
      setFeedbackErrors((current) => ({
        ...current,
        [recommendation.id]: "Sign in to save this recommendation preference."
      }));
      return;
    }

    setFeedbackPendingIds((current) => new Set(current).add(recommendation.id));
    setFeedbackErrors((current) => {
      const next = { ...current };
      delete next[recommendation.id];
      return next;
    });

    try {
      await setRecommendationFeedbackState(recommendation, userSignalScope, state);
      if (state === "not_interested" || state === "suppress") {
        setRecommendations((current) => current.filter((item) => item.id !== recommendation.id));
      } else {
        setVersion((value) => value + 1);
      }
    } catch {
      setFeedbackErrors((current) => ({
        ...current,
        [recommendation.id]: "Could not save this preference. Try again."
      }));
    } finally {
      setFeedbackPendingIds((current) => {
        const next = new Set(current);
        next.delete(recommendation.id);
        return next;
      });
    }
  }, [excludeRecommendation, userSignalScope]);

  const reset = useCallback(() => {
    resetDiscoveryControls();
    setVersion((value) => value + 1);
  }, []);

  return {
    recommendations,
    loading,
    error,
    enabled: controls.enabled,
    feedbackAvailable: Boolean(userSignalScope),
    feedbackPendingIds,
    feedbackErrors,
    refresh,
    setEnabled,
    excludeItem,
    excludeRecommendation,
    setRecommendationFeedback,
    reset
  };
}
