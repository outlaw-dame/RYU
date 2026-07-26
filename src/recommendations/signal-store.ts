/**
 * Recommendation signal store.
 *
 * Persists user preference signals to localStorage. Each signal represents
 * an explicit or inferred preference about an entity (author, work, genre, etc).
 *
 * Key behaviors:
 * - Explicit signals override inferred signals for the same entity+kind
 * - Expired signals stop applying but remain for audit/undo
 * - Reset removes inferred signals by default; explicit requires explicit call
 * - Input validation prevents injection/corruption
 */

import type {
  CreateSignalParams,
  RecommendationSignal,
  SignalEntityType,
  SignalKind,
  SignalProvenance
} from "./signal-types";
import { buildSignalId, isSignalActive, isSignalExpired } from "./signal-types";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ryu:recommendation-signals";
const MAX_SIGNALS = 2000;
const MAX_ENTITY_ID_LENGTH = 1024;

// ─── Validation ───────────────────────────────────────────────────────────────

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

function isValidSignal(s: unknown): s is RecommendationSignal {
  if (!s || typeof s !== "object") return false;
  const sig = s as Record<string, unknown>;
  return (
    typeof sig.id === "string" && sig.id.length > 0 &&
    typeof sig.entityType === "string" && VALID_ENTITY_TYPES.has(sig.entityType) &&
    typeof sig.entityId === "string" && sig.entityId.length > 0 &&
    typeof sig.kind === "string" && VALID_KINDS.has(sig.kind) &&
    typeof sig.strength === "number" &&
    typeof sig.provenance === "string" && VALID_PROVENANCES.has(sig.provenance) &&
    typeof sig.createdAt === "string" &&
    typeof sig.updatedAt === "string"
  );
}

function validateParams(params: CreateSignalParams): string | null {
  if (!params.entityId || params.entityId.length > MAX_ENTITY_ID_LENGTH) {
    return "Invalid entityId";
  }
  if (!VALID_ENTITY_TYPES.has(params.entityType)) {
    return "Invalid entityType";
  }
  if (!VALID_KINDS.has(params.kind)) {
    return "Invalid signal kind";
  }
  if (params.provenance && !VALID_PROVENANCES.has(params.provenance)) {
    return "Invalid provenance";
  }
  return null;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Load all signals from localStorage.
 */
export function loadSignals(): RecommendationSignal[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSignal);
  } catch {
    return [];
  }
}

function saveSignals(signals: RecommendationSignal[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
  } catch {
    // Storage full — non-fatal
  }
}

// ─── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Add or update a recommendation signal.
 *
 * If an explicit signal already exists for the same entity+kind, it is updated.
 * If an inferred signal exists and a new explicit one is added, the explicit
 * one takes precedence (inferred is kept for audit but won't be active).
 */
export function addSignal(params: CreateSignalParams): RecommendationSignal[] {
  const validationError = validateParams(params);
  if (validationError) {
    console.warn("[signal-store] Rejected signal:", validationError, params);
    return loadSignals();
  }

  const provenance: SignalProvenance = params.provenance ?? "user_explicit";
  const strength = Math.max(0, Math.min(1, params.strength ?? 1.0));
  const now = new Date().toISOString();
  const id = buildSignalId(params.entityType, params.entityId, params.kind, provenance);

  const signals = loadSignals();

  // Check capacity
  if (signals.length >= MAX_SIGNALS && !signals.some((s) => s.id === id)) {
    // Evict the oldest expired signal, or the oldest inferred signal
    const expiredIdx = signals.findIndex(isSignalExpired);
    if (expiredIdx >= 0) {
      signals.splice(expiredIdx, 1);
    } else {
      const inferredIdx = signals.findIndex((s) => s.provenance === "local_inference");
      if (inferredIdx >= 0) signals.splice(inferredIdx, 1);
    }
  }

  const existingIdx = signals.findIndex((s) => s.id === id);
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

  if (existingIdx >= 0) {
    signals[existingIdx] = newSignal;
  } else {
    signals.push(newSignal);
  }

  saveSignals(signals);
  return signals;
}

/**
 * Remove a signal by its ID.
 */
export function removeSignal(signalId: string): RecommendationSignal[] {
  const signals = loadSignals().filter((s) => s.id !== signalId);
  saveSignals(signals);
  return signals;
}

/**
 * Remove all signals for a specific entity.
 */
export function removeSignalsForEntity(
  entityType: SignalEntityType,
  entityId: string
): RecommendationSignal[] {
  const signals = loadSignals().filter(
    (s) => !(s.entityType === entityType && s.entityId === entityId)
  );
  saveSignals(signals);
  return signals;
}

/**
 * Get all active (non-expired) signals for a specific entity.
 */
export function getActiveSignalsForEntity(
  entityType: SignalEntityType,
  entityId: string
): RecommendationSignal[] {
  return loadSignals().filter(
    (s) => s.entityType === entityType && s.entityId === entityId && isSignalActive(s)
  );
}

/**
 * Get all active signals of a specific kind.
 */
export function getActiveSignalsByKind(kind: SignalKind): RecommendationSignal[] {
  return loadSignals().filter((s) => s.kind === kind && isSignalActive(s));
}

/**
 * Get the effective signal for an entity+kind combination.
 * If both explicit and inferred exist, explicit wins.
 */
export function getEffectiveSignal(
  entityType: SignalEntityType,
  entityId: string,
  kind: SignalKind
): RecommendationSignal | undefined {
  const matching = loadSignals().filter(
    (s) => s.entityType === entityType && s.entityId === entityId && s.kind === kind && isSignalActive(s)
  );
  // Explicit wins over inferred
  return matching.find((s) => s.provenance === "user_explicit")
    ?? matching.find((s) => s.provenance === "imported")
    ?? matching.find((s) => s.provenance === "local_inference");
}

/**
 * Check if an entity is suppressed (has an active "suppress" or "not_interested" signal).
 */
export function isEntitySuppressed(entityType: SignalEntityType, entityId: string): boolean {
  const signals = getActiveSignalsForEntity(entityType, entityId);
  return signals.some((s) => s.kind === "suppress" || s.kind === "not_interested");
}

/**
 * Reset inferred signals only (preserves explicit user decisions).
 */
export function resetInferredSignals(): RecommendationSignal[] {
  const signals = loadSignals().filter((s) => s.provenance !== "local_inference");
  saveSignals(signals);
  return signals;
}

/**
 * Reset ALL signals (including explicit). Use with confirmation.
 */
export function resetAllSignals(): RecommendationSignal[] {
  saveSignals([]);
  return [];
}

/**
 * Purge expired signals (cleanup).
 */
export function purgeExpiredSignals(): RecommendationSignal[] {
  const signals = loadSignals().filter(isSignalActive);
  saveSignals(signals);
  return signals;
}

/**
 * Get signal counts by kind (for diagnostics/debug panel).
 */
export function getSignalCounts(): Record<string, number> {
  const signals = loadSignals().filter(isSignalActive);
  const counts: Record<string, number> = {};
  for (const s of signals) {
    counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  }
  return counts;
}
