/** Recommendation signal store with authenticated-owner partitioning. */

import type {
  CreateSignalParams,
  RecommendationSignal,
  SignalEntityType,
  SignalKind,
  SignalProvenance
} from "./signal-types";
import { buildSignalId, isSignalActive, isSignalExpired } from "./signal-types";

const STORAGE_KEY_PREFIX = "ryu:recommendation-signals";
const MAX_SIGNALS = 2000;
const MAX_ENTITY_ID_LENGTH = 1024;
const MAX_OWNER_ID_LENGTH = 512;

const VALID_ENTITY_TYPES: Set<string> = new Set([
  "author", "work", "edition", "series", "publisher",
  "genre", "tag", "trope", "account", "domain", "source"
]);
const VALID_KINDS: Set<string> = new Set([
  "show_more", "show_less", "not_interested", "suppress",
  "prefer", "trusted", "low_trust"
]);
const VALID_PROVENANCES: Set<string> = new Set([
  "user_explicit", "local_inference", "imported"
]);

function storageKey(ownerAccountId?: string): string | null {
  if (ownerAccountId === undefined) return STORAGE_KEY_PREFIX; // legacy/test compatibility only
  const owner = ownerAccountId.trim();
  if (!owner || owner.length > MAX_OWNER_ID_LENGTH) return null;
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(owner)}`;
}

export function recommendationSignalStorageKey(ownerAccountId: string): string | null {
  return storageKey(ownerAccountId);
}

function isValidSignal(s: unknown): s is RecommendationSignal {
  if (!s || typeof s !== "object") return false;
  const sig = s as Record<string, unknown>;
  return (
    typeof sig.id === "string" && sig.id.length > 0 &&
    typeof sig.entityType === "string" && VALID_ENTITY_TYPES.has(sig.entityType) &&
    typeof sig.entityId === "string" && sig.entityId.length > 0 &&
    typeof sig.kind === "string" && VALID_KINDS.has(sig.kind) &&
    typeof sig.strength === "number" && Number.isFinite(sig.strength) &&
    typeof sig.provenance === "string" && VALID_PROVENANCES.has(sig.provenance) &&
    typeof sig.createdAt === "string" &&
    typeof sig.updatedAt === "string"
  );
}

function validateParams(params: CreateSignalParams): string | null {
  if (!params.entityId || params.entityId.length > MAX_ENTITY_ID_LENGTH) return "Invalid entityId";
  if (!VALID_ENTITY_TYPES.has(params.entityType)) return "Invalid entityType";
  if (!VALID_KINDS.has(params.kind)) return "Invalid signal kind";
  if (params.provenance && !VALID_PROVENANCES.has(params.provenance)) return "Invalid provenance";
  return null;
}

export function loadSignals(ownerAccountId?: string): RecommendationSignal[] {
  if (typeof localStorage === "undefined") return [];
  const key = storageKey(ownerAccountId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidSignal) : [];
  } catch {
    return [];
  }
}

function saveSignals(signals: RecommendationSignal[], ownerAccountId?: string): void {
  if (typeof localStorage === "undefined") return;
  const key = storageKey(ownerAccountId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(signals.slice(0, MAX_SIGNALS)));
  } catch {
    // Preference persistence is best-effort; callers retain in-memory state.
  }
}

function removeOpposingExplicitSignals(
  signals: RecommendationSignal[],
  params: CreateSignalParams,
  provenance: SignalProvenance
): RecommendationSignal[] {
  if (provenance !== "user_explicit") return signals;
  const opposite = params.kind === "show_more"
    ? "show_less"
    : params.kind === "show_less"
      ? "show_more"
      : null;
  if (!opposite) return signals;
  return signals.filter((signal) => !(
    signal.entityType === params.entityType &&
    signal.entityId === params.entityId &&
    signal.kind === opposite &&
    signal.provenance === "user_explicit"
  ));
}

export function addSignal(
  params: CreateSignalParams,
  ownerAccountId?: string
): RecommendationSignal[] {
  const validationError = validateParams(params);
  if (validationError) return loadSignals(ownerAccountId);

  const provenance: SignalProvenance = params.provenance ?? "user_explicit";
  const strength = Math.max(0, Math.min(1, params.strength ?? 1));
  const now = new Date().toISOString();
  const id = buildSignalId(params.entityType, params.entityId, params.kind, provenance);
  let signals = removeOpposingExplicitSignals(loadSignals(ownerAccountId), params, provenance);
  let existingIdx = signals.findIndex((signal) => signal.id === id);

  if (signals.length >= MAX_SIGNALS && existingIdx < 0) {
    const expiredIdx = signals.findIndex(isSignalExpired);
    const inferredIdx = expiredIdx < 0
      ? signals.findIndex((signal) => signal.provenance === "local_inference")
      : -1;
    const evictionIdx = expiredIdx >= 0 ? expiredIdx : inferredIdx;
    if (evictionIdx < 0) return signals;
    signals.splice(evictionIdx, 1);
    existingIdx = signals.findIndex((signal) => signal.id === id);
  }

  const newSignal: RecommendationSignal = {
    id,
    entityType: params.entityType,
    entityId: params.entityId,
    kind: params.kind,
    strength,
    provenance,
    reason: params.reason,
    expiresAt: params.durationMs
      ? new Date(Date.now() + params.durationMs).toISOString()
      : undefined,
    createdAt: existingIdx >= 0 ? signals[existingIdx].createdAt : now,
    updatedAt: now
  };

  if (existingIdx >= 0) signals[existingIdx] = newSignal;
  else signals.push(newSignal);
  saveSignals(signals, ownerAccountId);
  return signals;
}

export function removeSignal(signalId: string, ownerAccountId?: string): RecommendationSignal[] {
  const signals = loadSignals(ownerAccountId).filter((signal) => signal.id !== signalId);
  saveSignals(signals, ownerAccountId);
  return signals;
}

export function removeSignalsForEntity(
  entityType: SignalEntityType,
  entityId: string,
  ownerAccountId?: string
): RecommendationSignal[] {
  const signals = loadSignals(ownerAccountId).filter(
    (signal) => !(signal.entityType === entityType && signal.entityId === entityId)
  );
  saveSignals(signals, ownerAccountId);
  return signals;
}

export function getActiveSignalsForEntity(
  entityType: SignalEntityType,
  entityId: string,
  ownerAccountId?: string
): RecommendationSignal[] {
  return loadSignals(ownerAccountId).filter(
    (signal) => signal.entityType === entityType && signal.entityId === entityId && isSignalActive(signal)
  );
}

export function getActiveSignalsByKind(
  kind: SignalKind,
  ownerAccountId?: string
): RecommendationSignal[] {
  return loadSignals(ownerAccountId).filter((signal) => signal.kind === kind && isSignalActive(signal));
}

export function getEffectiveSignal(
  entityType: SignalEntityType,
  entityId: string,
  kind: SignalKind,
  ownerAccountId?: string
): RecommendationSignal | undefined {
  const matching = loadSignals(ownerAccountId).filter(
    (signal) => signal.entityType === entityType && signal.entityId === entityId && signal.kind === kind && isSignalActive(signal)
  );
  return matching.find((signal) => signal.provenance === "user_explicit")
    ?? matching.find((signal) => signal.provenance === "imported")
    ?? matching.find((signal) => signal.provenance === "local_inference");
}

export function isEntitySuppressed(
  entityType: SignalEntityType,
  entityId: string,
  ownerAccountId?: string
): boolean {
  return getActiveSignalsForEntity(entityType, entityId, ownerAccountId)
    .some((signal) => signal.kind === "suppress" || signal.kind === "not_interested");
}

export function resetInferredSignals(ownerAccountId?: string): RecommendationSignal[] {
  const signals = loadSignals(ownerAccountId).filter((signal) => signal.provenance !== "local_inference");
  saveSignals(signals, ownerAccountId);
  return signals;
}

export function resetAllSignals(ownerAccountId?: string): RecommendationSignal[] {
  saveSignals([], ownerAccountId);
  return [];
}

export function purgeExpiredSignals(ownerAccountId?: string): RecommendationSignal[] {
  const signals = loadSignals(ownerAccountId).filter(isSignalActive);
  saveSignals(signals, ownerAccountId);
  return signals;
}

export function getSignalCounts(ownerAccountId?: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const signal of loadSignals(ownerAccountId).filter(isSignalActive)) {
    counts[signal.kind] = (counts[signal.kind] ?? 0) + 1;
  }
  return counts;
}
