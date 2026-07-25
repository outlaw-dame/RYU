import type { Recommendation } from "../discovery/types";
import type {
  UserRecommendationSignalDoc,
  UserSignalType
} from "./user-signal-schema";
import {
  listUserSignals,
  normalizeUserSignalScope,
  removeUserSignal,
  upsertUserSignal,
  type UserSignalQuery,
  type UserSignalScope
} from "./user-signal-store";
import type { UserSignalInput } from "./user-signals";

export const RECOMMENDATION_FEEDBACK_STATES = [
  "show_more",
  "show_less",
  "not_interested",
  "suppress",
  "neutral"
] as const;

export type RecommendationFeedbackState =
  (typeof RECOMMENDATION_FEEDBACK_STATES)[number];

export type RecommendationFeedbackTarget = Pick<Recommendation, "id" | "entityType">;

export type RecommendationFeedbackDependencies = {
  listSignals?: (query: UserSignalQuery) => Promise<UserRecommendationSignalDoc[]>;
  writeSignal?: (input: UserSignalInput) => Promise<UserRecommendationSignalDoc>;
  removeSignal?: (id: string, scope: UserSignalScope) => Promise<boolean>;
};

export type RecommendationFeedbackResult = Readonly<{
  state: RecommendationFeedbackState;
  persistedSignal: UserRecommendationSignalDoc | null;
  removedSignalCount: number;
}>;

const FEEDBACK_SIGNAL_TYPES = [
  "show_more",
  "show_less",
  "not_interested",
  "suppress"
] as const satisfies readonly UserSignalType[];

const FEEDBACK_PRECEDENCE: readonly RecommendationFeedbackState[] = [
  "suppress",
  "not_interested",
  "show_less",
  "show_more",
  "neutral"
];

export async function getRecommendationFeedbackState(
  target: RecommendationFeedbackTarget,
  scope: UserSignalScope,
  dependencies: RecommendationFeedbackDependencies = {}
): Promise<RecommendationFeedbackState> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const canonicalTarget = normalizeTarget(target);
  const signals = await (dependencies.listSignals ?? listUserSignals)({
    ...canonicalScope,
    entityType: canonicalTarget.entityType,
    entityId: canonicalTarget.id,
    provenance: "user_explicit"
  });

  const activeTypes = new Set(
    signals
      .filter((signal) => signalMatchesFeedbackTarget(signal, canonicalScope, canonicalTarget))
      .filter((signal) => !signal.expiresAt || Date.parse(signal.expiresAt) > Date.now())
      .map((signal) => signal.signalType)
  );

  return FEEDBACK_PRECEDENCE.find((state) => state === "neutral" || activeTypes.has(state))
    ?? "neutral";
}

export async function setRecommendationFeedbackState(
  target: RecommendationFeedbackTarget,
  scope: UserSignalScope,
  state: RecommendationFeedbackState,
  dependencies: RecommendationFeedbackDependencies = {}
): Promise<RecommendationFeedbackResult> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const canonicalTarget = normalizeTarget(target);
  assertFeedbackState(state);

  const listSignals = dependencies.listSignals ?? listUserSignals;
  const writeSignal = dependencies.writeSignal ?? ((input) => upsertUserSignal(input));
  const removeSignal = dependencies.removeSignal ?? removeUserSignal;

  const existing = await listSignals({
    ...canonicalScope,
    entityType: canonicalTarget.entityType,
    entityId: canonicalTarget.id,
    provenance: "user_explicit"
  });
  const feedbackSignals = existing.filter((signal) =>
    signalMatchesFeedbackTarget(signal, canonicalScope, canonicalTarget)
  );

  if (state === "neutral") {
    const removals = await Promise.all(
      feedbackSignals.map((signal) => removeSignal(signal.id, canonicalScope))
    );
    return Object.freeze({
      state,
      persistedSignal: null,
      removedSignalCount: removals.filter(Boolean).length
    });
  }

  // Persist the requested state before removing conflicts. If cleanup fails,
  // older suppressive records remain effective rather than silently relaxing
  // a user's previous protection.
  const persistedSignal = await writeSignal({
    ...canonicalScope,
    entityType: canonicalTarget.entityType,
    entityId: canonicalTarget.id,
    signalType: state,
    strength: feedbackStrength(state),
    provenance: "user_explicit",
    reason: feedbackReason(state)
  });

  const conflictingSignals = feedbackSignals.filter((signal) =>
    signal.signalType !== state && signal.id !== persistedSignal.id
  );
  const removals = await Promise.all(
    conflictingSignals.map((signal) => removeSignal(signal.id, canonicalScope))
  );

  return Object.freeze({
    state,
    persistedSignal,
    removedSignalCount: removals.filter(Boolean).length
  });
}

export function listRecommendationFeedbackOptions(): readonly Readonly<{
  state: RecommendationFeedbackState;
  label: string;
  description: string;
  destructive: boolean;
}>[] {
  return RECOMMENDATION_FEEDBACK_STATES.map((state) => Object.freeze({
    state,
    label: feedbackLabel(state),
    description: feedbackDescription(state),
    destructive: state === "not_interested" || state === "suppress"
  }));
}

export function feedbackLabel(state: RecommendationFeedbackState): string {
  switch (state) {
    case "show_more": return "Show more like this";
    case "show_less": return "Show less like this";
    case "not_interested": return "Not interested";
    case "suppress": return "Never recommend this";
    case "neutral": return "Reset preference";
  }
}

export function feedbackDescription(state: RecommendationFeedbackState): string {
  switch (state) {
    case "show_more":
      return "Increase the influence of this author or edition in future recommendations.";
    case "show_less":
      return "Reduce the influence of this author or edition without hiding it completely.";
    case "not_interested":
      return "Hide this recommendation and avoid suggesting this entity in normal discovery.";
    case "suppress":
      return "Exclude this entity from normal recommendation results until the preference is reset.";
    case "neutral":
      return "Remove explicit recommendation feedback for this entity.";
  }
}

function signalMatchesFeedbackTarget(
  signal: UserRecommendationSignalDoc,
  scope: UserSignalScope,
  target: RecommendationFeedbackTarget
): boolean {
  return signal.ownerAccountId === scope.ownerAccountId
    && signal.instanceOrigin === scope.instanceOrigin
    && signal.entityType === target.entityType
    && signal.entityId === target.id
    && signal.provenance === "user_explicit"
    && FEEDBACK_SIGNAL_TYPES.includes(
      signal.signalType as typeof FEEDBACK_SIGNAL_TYPES[number]
    );
}

function normalizeTarget(target: RecommendationFeedbackTarget): RecommendationFeedbackTarget {
  const id = typeof target.id === "string" ? target.id.trim() : "";
  if (!id) throw new Error("Recommendation feedback target ID is required");
  if (id.length > 2048) throw new Error("Recommendation feedback target ID is too long");
  if (target.entityType !== "author" && target.entityType !== "edition") {
    throw new Error("Recommendation feedback target type is invalid");
  }
  return Object.freeze({ id, entityType: target.entityType });
}

function assertFeedbackState(value: string): asserts value is RecommendationFeedbackState {
  if (!(RECOMMENDATION_FEEDBACK_STATES as readonly string[]).includes(value)) {
    throw new Error("Recommendation feedback state is invalid");
  }
}

function feedbackStrength(state: Exclude<RecommendationFeedbackState, "neutral">): number {
  switch (state) {
    case "show_more": return 0.5;
    case "show_less": return -0.5;
    case "not_interested": return -1;
    case "suppress": return -1;
  }
}

function feedbackReason(state: Exclude<RecommendationFeedbackState, "neutral">): string {
  switch (state) {
    case "show_more": return "User requested more recommendations like this entity";
    case "show_less": return "User requested fewer recommendations like this entity";
    case "not_interested": return "User marked this recommendation as not interesting";
    case "suppress": return "User explicitly suppressed this recommendation entity";
  }
}
