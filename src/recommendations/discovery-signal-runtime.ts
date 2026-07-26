import { excludeFromDiscovery, removeExclusion } from "../discovery/user-controls";
import { getDatabase } from "../db/client";
import type { Recommendation } from "../discovery/types";
import {
  migrateLegacyDiscoveryExclusions,
  type LegacyDiscoveryMigrationOptions,
  type LegacyDiscoveryMigrationResult
} from "./legacy-discovery-migration";
import {
  setRecommendationFeedbackState,
  type RecommendationFeedbackState,
  type RecommendationFeedbackTarget
} from "./recommendation-feedback";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import {
  listUserSignals,
  normalizeUserSignalScope,
  upsertUserSignal,
  type UserSignalQuery,
  type UserSignalScope
} from "./user-signal-store";
import type { UserSignalInput } from "./user-signals";

const DISCOVERY_FEEDBACK_TYPES = [
  "show_more",
  "show_less",
  "not_interested",
  "suppress"
] as const;

export type DiscoveryFeedbackState = Exclude<RecommendationFeedbackState, "neutral">;

export type DiscoveryFeedbackPolicy = Readonly<{
  excludedIds: readonly string[];
  stateByTarget: Readonly<Record<string, DiscoveryFeedbackState>>;
}>;

export type DiscoverySignalRuntimeDependencies = {
  migrateLegacy?: (
    options: LegacyDiscoveryMigrationOptions
  ) => Promise<LegacyDiscoveryMigrationResult>;
  listSignals?: (query: UserSignalQuery) => Promise<UserRecommendationSignalDoc[]>;
  writeSignal?: (
    input: UserSignalInput,
    options?: { now?: Date }
  ) => Promise<UserRecommendationSignalDoc>;
  writeLegacyExclusion?: (entityId: string) => unknown;
  removeLegacyExclusion?: (entityId: string) => unknown;
  resolveEntityType?: (entityId: string) => Promise<"author" | "edition" | null>;
  resetFeedback?: (
    target: RecommendationFeedbackTarget,
    scope: UserSignalScope,
    state: "neutral"
  ) => Promise<unknown>;
};

export async function loadDiscoveryFeedbackPolicy(
  scope: UserSignalScope,
  dependencies: DiscoverySignalRuntimeDependencies = {}
): Promise<DiscoveryFeedbackPolicy> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const migrateLegacy = dependencies.migrateLegacy ?? migrateLegacyDiscoveryExclusions;
  const resolveEntityType = dependencies.resolveEntityType ?? resolveStoredRecommendationEntityType;

  await migrateLegacy({ scope: canonicalScope, resolveEntityType });

  const signals = await (dependencies.listSignals ?? listUserSignals)({
    ...canonicalScope,
    provenance: "user_explicit"
  });

  const stateByTarget: Record<string, DiscoveryFeedbackState> = {};
  const excludedIds = new Set<string>();

  for (const signal of signals) {
    if (!signalMatchesScope(signal, canonicalScope)) continue;
    if (signal.entityType !== "author" && signal.entityType !== "edition") continue;
    if (!DISCOVERY_FEEDBACK_TYPES.includes(signal.signalType as DiscoveryFeedbackState)) continue;
    if (signal.expiresAt && Date.parse(signal.expiresAt) <= Date.now()) continue;

    const state = signal.signalType as DiscoveryFeedbackState;
    const key = buildRecommendationTargetKey(signal.entityType, signal.entityId);
    const current = stateByTarget[key];
    if (!current || feedbackPrecedence(state) > feedbackPrecedence(current)) {
      stateByTarget[key] = state;
    }
  }

  for (const [key, state] of Object.entries(stateByTarget)) {
    if (state === "not_interested" || state === "suppress") {
      excludedIds.add(key.slice(key.indexOf(":") + 1));
    }
  }

  return Object.freeze({
    excludedIds: Object.freeze([...excludedIds].sort()),
    stateByTarget: Object.freeze({ ...stateByTarget })
  });
}

export async function loadDiscoveryExclusionIds(
  scope: UserSignalScope,
  dependencies: DiscoverySignalRuntimeDependencies = {}
): Promise<string[]> {
  const policy = await loadDiscoveryFeedbackPolicy(scope, dependencies);
  return [...policy.excludedIds];
}

export async function resetHiddenDiscoveryFeedback(
  scope: UserSignalScope,
  dependencies: DiscoverySignalRuntimeDependencies = {}
): Promise<number> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const signals = await (dependencies.listSignals ?? listUserSignals)({
    ...canonicalScope,
    provenance: "user_explicit"
  });
  const targets = new Map<string, RecommendationFeedbackTarget>();

  for (const signal of signals) {
    if (!signalMatchesScope(signal, canonicalScope)) continue;
    if (signal.entityType !== "author" && signal.entityType !== "edition") continue;
    if (signal.signalType !== "not_interested" && signal.signalType !== "suppress") continue;
    const target = Object.freeze({ entityType: signal.entityType, id: signal.entityId });
    targets.set(buildRecommendationTargetKey(target.entityType, target.id), target);
  }

  const resetFeedback = dependencies.resetFeedback ?? setRecommendationFeedbackState;
  const removeLegacy = dependencies.removeLegacyExclusion ?? removeExclusion;
  const hiddenTargets = [...targets.values()];

  // Reset durable state first. Legacy exclusions are cleared only after every
  // durable reset succeeds so a partial failure cannot silently broaden results.
  await Promise.all(hiddenTargets.map((target) =>
    resetFeedback(target, canonicalScope, "neutral")
  ));
  for (const target of hiddenTargets) {
    removeLegacy(target.id);
  }
  return hiddenTargets.length;
}

export function applyDiscoveryFeedbackScore(
  recommendation: Pick<Recommendation, "id" | "entityType" | "score">,
  policy: Pick<DiscoveryFeedbackPolicy, "stateByTarget">
): number {
  const state = policy.stateByTarget[
    buildRecommendationTargetKey(recommendation.entityType, recommendation.id)
  ];
  if (state === "show_more") return recommendation.score + 0.15;
  if (state === "show_less") return recommendation.score - 0.15;
  return recommendation.score;
}

export async function recordDiscoveryNotInterested(
  recommendation: Pick<Recommendation, "id" | "entityType">,
  scope: UserSignalScope,
  dependencies: DiscoverySignalRuntimeDependencies = {}
): Promise<void> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const entityId = normalizeRecommendationId(recommendation.id);
  const writeLegacyExclusion = dependencies.writeLegacyExclusion ?? excludeFromDiscovery;

  writeLegacyExclusion(entityId);

  await (dependencies.writeSignal ?? upsertUserSignal)({
    ...canonicalScope,
    entityType: recommendation.entityType,
    entityId,
    signalType: "not_interested",
    strength: -1,
    provenance: "user_explicit",
    reason: "User dismissed this discovery recommendation"
  });
}

export function buildUserSignalScopeFromSession(session: {
  connected?: boolean;
  instanceOrigin?: string;
  account?: { id?: string } | null;
} | null | undefined): UserSignalScope | null {
  if (!session?.connected || !session.instanceOrigin || !session.account?.id) return null;
  return normalizeUserSignalScope({
    ownerAccountId: session.account.id,
    instanceOrigin: session.instanceOrigin
  });
}

export function buildRecommendationTargetKey(
  entityType: "author" | "edition",
  entityId: string
): string {
  return `${entityType}:${normalizeRecommendationId(entityId)}`;
}

async function resolveStoredRecommendationEntityType(
  entityId: string
): Promise<"author" | "edition" | null> {
  const id = normalizeRecommendationId(entityId);
  const db = await getDatabase();
  const [author, edition] = await Promise.all([
    db.authors.findOne(id).exec(),
    db.editions.findOne(id).exec()
  ]);

  if (author && edition) return null;
  if (author) return "author";
  if (edition) return "edition";
  return null;
}

function signalMatchesScope(signal: UserRecommendationSignalDoc, scope: UserSignalScope): boolean {
  return signal.ownerAccountId === scope.ownerAccountId
    && signal.instanceOrigin === scope.instanceOrigin
    && signal.provenance === "user_explicit";
}

function feedbackPrecedence(state: DiscoveryFeedbackState): number {
  switch (state) {
    case "suppress": return 4;
    case "not_interested": return 3;
    case "show_less": return 2;
    case "show_more": return 1;
  }
}

function normalizeRecommendationId(value: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) throw new Error("Recommendation ID is required");
  if (id.length > 2048) throw new Error("Recommendation ID is too long");
  return id;
}
