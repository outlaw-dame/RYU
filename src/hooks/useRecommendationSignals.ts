/** Reactive, authenticated-owner-scoped recommendation signal state. */

import { useCallback, useEffect, useMemo, useState } from "react";
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
  recommendationSignalStorageKey,
  removeSignal,
  removeSignalsForEntity,
  resetAllSignals,
  resetInferredSignals
} from "../recommendations/signal-store";
import { isSignalActive } from "../recommendations/signal-types";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { useMastodonSession } from "../sync/use-mastodon-activity";

const SYNC_EVENT = "ryu:recommendation-signals-sync";

export interface UseRecommendationSignalsResult {
  activeSignals: RecommendationSignal[];
  totalCount: number;
  add: (params: CreateSignalParams) => void;
  remove: (signalId: string) => void;
  removeForEntity: (entityType: SignalEntityType, entityId: string) => void;
  isSuppressed: (entityType: SignalEntityType, entityId: string) => boolean;
  getEffective: (entityType: SignalEntityType, entityId: string, kind: SignalKind) => RecommendationSignal | undefined;
  getForEntity: (entityType: SignalEntityType, entityId: string) => RecommendationSignal[];
  getByKind: (kind: SignalKind) => RecommendationSignal[];
  resetInferred: () => void;
  resetAll: () => void;
  purgeExpired: () => void;
  counts: Record<string, number>;
  ownerAccountId: string | null;
}

export function useRecommendationSignals(): UseRecommendationSignalsResult {
  const sessionQuery = useMastodonSession();
  const ownerAccountId = useMemo(
    () => buildModerationOwnerIdentity(sessionQuery.data),
    [sessionQuery.data]
  );
  const [allSignals, setAllSignals] = useState<RecommendationSignal[]>([]);

  const reload = useCallback(() => {
    setAllSignals(ownerAccountId ? loadSignals(ownerAccountId) : []);
  }, [ownerAccountId]);

  useEffect(() => {
    reload();
    const expectedKey = ownerAccountId
      ? recommendationSignalStorageKey(ownerAccountId)
      : null;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || (expectedKey !== null && event.key === expectedKey)) reload();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SYNC_EVENT, reload);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SYNC_EVENT, reload);
    };
  }, [ownerAccountId, reload]);

  // Expiry is time-driven state. Schedule exactly one refresh for the nearest
  // active expiry so suppression and ranking cannot remain stale indefinitely.
  useEffect(() => {
    const now = Date.now();
    const nextExpiry = allSignals.reduce<number | null>((nearest, signal) => {
      if (!signal.expiresAt) return nearest;
      const expiry = Date.parse(signal.expiresAt);
      if (!Number.isFinite(expiry) || expiry <= now) return nearest;
      return nearest === null || expiry < nearest ? expiry : nearest;
    }, null);
    if (nextExpiry === null) return;
    const delay = Math.min(Math.max(nextExpiry - now + 25, 25), 2_147_483_647);
    const timer = window.setTimeout(reload, delay);
    return () => window.clearTimeout(timer);
  }, [allSignals, reload]);

  const notifySync = useCallback(() => {
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const add = useCallback((params: CreateSignalParams) => {
    if (!ownerAccountId) return;
    setAllSignals(addSignal(params, ownerAccountId));
    notifySync();
  }, [notifySync, ownerAccountId]);

  const remove = useCallback((signalId: string) => {
    if (!ownerAccountId) return;
    setAllSignals(removeSignal(signalId, ownerAccountId));
    notifySync();
  }, [notifySync, ownerAccountId]);

  const removeForEntity = useCallback((entityType: SignalEntityType, entityId: string) => {
    if (!ownerAccountId) return;
    setAllSignals(removeSignalsForEntity(entityType, entityId, ownerAccountId));
    notifySync();
  }, [notifySync, ownerAccountId]);

  const resetInferred = useCallback(() => {
    if (!ownerAccountId) return;
    setAllSignals(resetInferredSignals(ownerAccountId));
    notifySync();
  }, [notifySync, ownerAccountId]);

  const resetAll = useCallback(() => {
    if (!ownerAccountId) return;
    setAllSignals(resetAllSignals(ownerAccountId));
    notifySync();
  }, [notifySync, ownerAccountId]);

  const purgeExpired = useCallback(() => {
    if (!ownerAccountId) return;
    setAllSignals(purgeExpiredSignals(ownerAccountId));
    notifySync();
  }, [notifySync, ownerAccountId]);

  const activeSignals = allSignals.filter(isSignalActive);
  const counts = ownerAccountId ? getSignalCounts(ownerAccountId) : {};

  return {
    activeSignals,
    totalCount: allSignals.length,
    add,
    remove,
    removeForEntity,
    isSuppressed: useCallback(
      (entityType, entityId) => Boolean(ownerAccountId) && isEntitySuppressed(entityType, entityId, ownerAccountId ?? undefined),
      [ownerAccountId]
    ),
    getEffective: useCallback(
      (entityType, entityId, kind) => ownerAccountId
        ? getEffectiveSignal(entityType, entityId, kind, ownerAccountId)
        : undefined,
      [ownerAccountId]
    ),
    getForEntity: useCallback(
      (entityType, entityId) => ownerAccountId
        ? getActiveSignalsForEntity(entityType, entityId, ownerAccountId)
        : [],
      [ownerAccountId]
    ),
    getByKind: useCallback(
      (kind) => ownerAccountId ? getActiveSignalsByKind(kind, ownerAccountId) : [],
      [ownerAccountId]
    ),
    counts,
    resetInferred,
    resetAll,
    purgeExpired,
    ownerAccountId
  };
}
