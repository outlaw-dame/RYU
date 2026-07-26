/**
 * useReviewerTrust — React hook for managing reviewer trust levels.
 *
 * Provides reactive state and actions for setting, removing, and querying
 * reviewer trust. Keeps all instances in sync via custom events (same-tab)
 * and storage events (cross-tab).
 */

import { useCallback, useEffect, useState } from "react";
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

const SYNC_EVENT = "ryu:reviewer-trust-sync";

export interface UseReviewerTrustResult {
  /** All reviewer trust entries. */
  entries: ReviewerTrustEntry[];
  /** Set a reviewer's trust level. */
  setTrust: (accountId: string, level: ReviewerTrustLevel, options?: { acct?: string; reason?: string }) => void;
  /** Remove a reviewer's trust entry (revert to neutral). */
  removeTrust: (accountId: string) => void;
  /** Reset all reviewer trust entries. */
  resetAll: () => void;
  /** Get the trust level for a specific reviewer. */
  getTrustLevel: (accountId: string) => ReviewerTrustLevel;
  /** Check if a reviewer is excluded from recommendations. */
  isExcluded: (accountId: string) => boolean;
  /** Compute the bounded score contribution for a reviewer. */
  getScoreContribution: (accountId: string, confidence?: number) => { delta: number; exclude: boolean };
}

export function useReviewerTrust(): UseReviewerTrustResult {
  const [entries, setEntries] = useState<ReviewerTrustEntry[]>(() => loadReviewerTrust());

  // Sync across tabs and same-tab instances
  useEffect(() => {
    const reload = () => setEntries(loadReviewerTrust());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "ryu:reviewer-trust") reload();
    };
    const handleSync = () => reload();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SYNC_EVENT, handleSync);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SYNC_EVENT, handleSync);
    };
  }, []);

  const notifySync = useCallback(() => {
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const setTrust = useCallback((
    accountId: string,
    level: ReviewerTrustLevel,
    options?: { acct?: string; reason?: string }
  ) => {
    const updated = setReviewerTrustStore(accountId, level, options);
    setEntries(updated);
    notifySync();
  }, [notifySync]);

  const removeTrust = useCallback((accountId: string) => {
    const updated = removeReviewerTrustStore(accountId);
    setEntries(updated);
    notifySync();
  }, [notifySync]);

  const resetAll = useCallback(() => {
    const updated = resetAllStore();
    setEntries(updated);
    notifySync();
  }, [notifySync]);

  return {
    entries,
    setTrust,
    removeTrust,
    resetAll,
    getTrustLevel: getReviewerTrustLevel,
    isExcluded: isReviewerExcluded,
    getScoreContribution: computeReviewerTrustContribution
  };
}
