/**
 * useRecommendationSignals — React hook for managing recommendation signals.
 *
 * Provides reactive state and actions for the recommendation signal store.
 * Keeps all instances in sync via custom events (same-tab) and storage
 * events (cross-tab).
 */

import { useCallback, useEffect, useState } from "react";
import type {
  CreateSignalParams,
  RecommendationSignal,
  SignalEntityType,
  SignalKind
} from "../recommendations/signal-types";
import {
  addSignal,
  getActiveSignalsByKind,
  getActiveSignalsForEntity,
  getEffectiveSignal,
  getSignalCounts,
  isEntitySuppressed,
  loadSignals,
  purgeExpiredSignals,
  removeSignal,
  removeSignalsForEntity,
  resetAllSignals,
  resetInferredSignals
} from "../recommendations/signal-store";
import { isSignalActive } from "../recommendations/signal-types";

const SYNC_EVENT = "ryu:recommendation-signals-sync";

export interface UseRecommendationSignalsResult {
  /** All active (non-expired) signals. */
  activeSignals: RecommendationSignal[];
  /** Total signal count (including expired, for diagnostics). */
  totalCount: number;
  /** Add or update a signal. */
  add: (params: CreateSignalParams) => void;
  /** Remove a signal by ID. */
  remove: (signalId: string) => void;
  /** Remove all signals for a specific entity. */
  removeForEntity: (entityType: SignalEntityType, entityId: string) => void;
  /** Check if an entity is suppressed. */
  isSuppressed: (entityType: SignalEntityType, entityId: string) => boolean;
  /** Get the effective signal for an entity+kind. */
  getEffective: (entityType: SignalEntityType, entityId: string, kind: SignalKind) => RecommendationSignal | undefined;
  /** Get all active signals for an entity. */
  getForEntity: (entityType: SignalEntityType, entityId: string) => RecommendationSignal[];
  /** Get all active signals of a kind. */
  getByKind: (kind: SignalKind) => RecommendationSignal[];
  /** Reset only inferred signals (preserves explicit). */
  resetInferred: () => void;
  /** Reset ALL signals (requires explicit intent). */
  resetAll: () => void;
  /** Purge expired signals. */
  purgeExpired: () => void;
  /** Signal counts by kind (for diagnostics). */
  counts: Record<string, number>;
}

export function useRecommendationSignals(): UseRecommendationSignalsResult {
  const [allSignals, setAllSignals] = useState<RecommendationSignal[]>(() => loadSignals());

  // Sync across tabs and same-tab instances
  useEffect(() => {
    const reload = () => setAllSignals(loadSignals());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "ryu:recommendation-signals") reload();
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

  const add = useCallback((params: CreateSignalParams) => {
    const updated = addSignal(params);
    setAllSignals(updated);
    notifySync();
  }, [notifySync]);

  const remove = useCallback((signalId: string) => {
    const updated = removeSignal(signalId);
    setAllSignals(updated);
    notifySync();
  }, [notifySync]);

  const removeForEntity = useCallback((entityType: SignalEntityType, entityId: string) => {
    const updated = removeSignalsForEntity(entityType, entityId);
    setAllSignals(updated);
    notifySync();
  }, [notifySync]);

  const resetInferred = useCallback(() => {
    const updated = resetInferredSignals();
    setAllSignals(updated);
    notifySync();
  }, [notifySync]);

  const resetAll = useCallback(() => {
    const updated = resetAllSignals();
    setAllSignals(updated);
    notifySync();
  }, [notifySync]);

  const purgeExpired = useCallback(() => {
    const updated = purgeExpiredSignals();
    setAllSignals(updated);
    notifySync();
  }, [notifySync]);

  const activeSignals = allSignals.filter(isSignalActive);
  const counts = getSignalCounts();

  return {
    activeSignals,
    totalCount: allSignals.length,
    add,
    remove,
    removeForEntity,
    isSuppressed: isEntitySuppressed,
    getEffective: getEffectiveSignal,
    getForEntity: getActiveSignalsForEntity,
    getByKind: getActiveSignalsByKind,
    counts,
    resetInferred,
    resetAll,
    purgeExpired
  };
}
