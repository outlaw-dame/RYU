/**
 * useReviewerTrust — authenticated, instance-scoped reviewer trust state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadReviewerTrust,
  setReviewerTrust as setReviewerTrustStore,
  removeReviewerTrust as removeReviewerTrustStore,
  resetAllReviewerTrust as resetAllStore,
  getReviewerTrustLevel,
  isReviewerExcluded,
  computeReviewerTrustContribution,
  type ReviewerTrustEntry,
  type ReviewerTrustLevel
} from "../recommendations/reviewer-trust-store";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { useMastodonSession } from "../sync/use-mastodon-activity";

const SYNC_EVENT = "ryu:reviewer-trust-sync";
const STORAGE_KEY_PREFIX = "ryu:reviewer-trust";

export interface UseReviewerTrustResult {
  entries: ReviewerTrustEntry[];
  setTrust: (
    accountId: string,
    level: ReviewerTrustLevel,
    options?: { acct?: string; reason?: string }
  ) => void;
  removeTrust: (accountId: string) => void;
  resetAll: () => void;
  getTrustLevel: (accountId: string) => ReviewerTrustLevel;
  isExcluded: (accountId: string) => boolean;
  getScoreContribution: (
    accountId: string,
    confidence?: number
  ) => { delta: number; exclude: boolean };
}

export function useReviewerTrust(): UseReviewerTrustResult {
  const sessionQuery = useMastodonSession();
  const ownerAccountId = useMemo(
    () => buildModerationOwnerIdentity(sessionQuery.data),
    [sessionQuery.data]
  );
  const [entries, setEntries] = useState<ReviewerTrustEntry[]>([]);

  const reload = useCallback(() => {
    setEntries(ownerAccountId ? loadReviewerTrust(ownerAccountId) : []);
  }, [ownerAccountId]);

  useEffect(() => {
    reload();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_KEY_PREFIX)) reload();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SYNC_EVENT, reload);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SYNC_EVENT, reload);
    };
  }, [reload]);

  const notifySync = useCallback(() => {
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const setTrust = useCallback((
    accountId: string,
    level: ReviewerTrustLevel,
    options?: { acct?: string; reason?: string }
  ) => {
    if (!ownerAccountId) return;
    const updated = setReviewerTrustStore(accountId, level, {
      ...options,
      ownerAccountId
    });
    setEntries(updated);
    notifySync();
  }, [notifySync, ownerAccountId]);

  const removeTrust = useCallback((accountId: string) => {
    if (!ownerAccountId) return;
    const updated = removeReviewerTrustStore(accountId, ownerAccountId);
    setEntries(updated);
    notifySync();
  }, [notifySync, ownerAccountId]);

  const resetAll = useCallback(() => {
    if (!ownerAccountId) return;
    const updated = resetAllStore(ownerAccountId);
    setEntries(updated);
    notifySync();
  }, [notifySync, ownerAccountId]);

  const getTrustLevel = useCallback(
    (accountId: string) => ownerAccountId
      ? getReviewerTrustLevel(accountId, ownerAccountId)
      : "neutral",
    [ownerAccountId]
  );

  const isExcluded = useCallback(
    (accountId: string) => Boolean(ownerAccountId) &&
      isReviewerExcluded(accountId, ownerAccountId ?? undefined),
    [ownerAccountId]
  );

  const getScoreContribution = useCallback(
    (accountId: string, confidence?: number) => ownerAccountId
      ? computeReviewerTrustContribution(accountId, confidence, ownerAccountId)
      : { delta: 0, exclude: false },
    [ownerAccountId]
  );

  return {
    entries,
    setTrust,
    removeTrust,
    resetAll,
    getTrustLevel,
    isExcluded,
    getScoreContribution
  };
}
