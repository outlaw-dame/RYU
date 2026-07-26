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
  loadDiscoveryFeedbackPolicy,
  recordDiscoveryNotInterested,
  resetHiddenDiscoveryFeedback,
  type DiscoveryFeedbackPolicy
} from "../recommendations/discovery-signal-runtime";
import {
  setRecommendationFeedbackState,
  type RecommendationFeedbackState
} from "../recommendations/recommendation-feedback";
import { subscribeReviewerTrustInvalidation } from "../recommendations/reviewer-trust-manager-registry";
import { applyVerifiedReviewerTrustToDiscovery } from "../recommendations/reviewer-trust-discovery";
import { evaluateRecommendationCandidates } from "../recommendations/recommendation-score-trace";
import { isSearchFeatureEnabled } from "../search/release/featureFlags";
import { useMastodonSession } from "../sync/use-mastodon-activity";

const EMPTY_FEEDBACK_POLICY: DiscoveryFeedbackPolicy = Object.freeze({
  excludedIds: Object.freeze([]),
  stateByTarget: Object.freeze({})
});

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
  const connected = sessionQuery.data?.connected;
  const instanceOrigin = sessionQuery.data?.instanceOrigin;
  const ownerAccountId = sessionQuery.data?.account?.id;

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);
  const [feedbackPendingIds, setFeedbackPendingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [feedbackErrors, setFeedbackErrors] = useState<Readonly<Record<string, string>>>(() => ({}));
  const [resettingHidden, setResettingHidden] = useState(false);
  const [hiddenResetError, setHiddenResetError] = useState<string | null>(null);

  const controls = useMemo(() => getDiscoveryControls(), [version]);
  const userSignalScope = useMemo(
    () => buildUserSignalScopeFromSession({
      connected,
      instanceOrigin,
      account: ownerAccountId ? { id: ownerAccountId } : null
    }),
    [connected, instanceOrigin, ownerAccountId]
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
      let durablePolicy: DiscoveryFeedbackPolicy = EMPTY_FEEDBACK_POLICY;
      if (userSignalScope) {
        try {
          durablePolicy = await loadDiscoveryFeedbackPolicy(userSignalScope);
        } catch {
          durablePolicy = EMPTY_FEEDBACK_POLICY;
        }
      }

      const excludeIds = [...new Set(currentControls.excludedIds)];
      const settled = await Promise.allSettled([
        editionId
          ? findRelatedBooks(editionId, { limit: Math.ceil(limit / 3), excludeIds })
          : Promise.resolve([]),
        findSimilarAuthors({ limit: Math.ceil(limit / 4), excludeIds }),
        findBecauseYouRead({ limit: Math.ceil(limit / 2), excludeIds })
      ]);
      const results: Recommendation[] = [
        ...(settled[0].status === "fulfilled" ? settled[0].value : []),
        ...(settled[1].status === "fulfilled" ? settled[1].value : []),
        ...(settled[2].status === "fulfilled" ? settled[2].value : [])
      ];

      const excludedSet = new Set(excludeIds);
      const eligible = results.filter((recommendation) => !excludedSet.has(recommendation.id));
      const feedbackRanked = evaluateRecommendationCandidates(eligible, durablePolicy);
      let trustRanked = feedbackRanked;
      if (userSignalScope) {
        try {
          trustRanked = await applyVerifiedReviewerTrustToDiscovery(feedbackRanked, userSignalScope);
        } catch {
          // Reviewer-trust enrichment is supplemental. A transient local database,
          // migration, or read failure must not suppress otherwise valid discovery
          // results; the next invalidation or refresh retries the enrichment.
          trustRanked = feedbackRanked;
        }
      }

      setRecommendations(
        trustRanked
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
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

  useEffect(() => subscribeReviewerTrustInvalidation(() => {
    setVersion((value) => value + 1);
  }), []);

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

    void recordDiscoveryNotInterested(recommendation, userSignalScope).catch(() => undefined);
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
        [recommendation.id]: "discovery.feedback.signInError"
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
        [recommendation.id]: "discovery.feedback.saveError"
      }));
    } finally {
      setFeedbackPendingIds((current) => {
        const next = new Set(current);
        next.delete(recommendation.id);
        return next;
      });
    }
  }, [excludeRecommendation, userSignalScope]);

  const resetHiddenRecommendations = useCallback(async (): Promise<void> => {
    if (!userSignalScope || resettingHidden) return;
    setResettingHidden(true);
    setHiddenResetError(null);
    try {
      await resetHiddenDiscoveryFeedback(userSignalScope);
      setVersion((value) => value + 1);
    } catch {
      setHiddenResetError("discovery.feedback.resetHiddenError");
    } finally {
      setResettingHidden(false);
    }
  }, [resettingHidden, userSignalScope]);

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
    resettingHidden,
    hiddenResetError,
    refresh,
    setEnabled,
    excludeItem,
    excludeRecommendation,
    setRecommendationFeedback,
    resetHiddenRecommendations,
    reset
  };
}
