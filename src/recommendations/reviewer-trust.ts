import type {
  UserRecommendationSignalDoc,
  UserSignalType
} from "./user-signal-schema";
import {
  isUserSignalExpired,
  type UserSignalInput
} from "./user-signals";
import {
  listUserSignals,
  removeUserSignal,
  upsertUserSignal,
  type UserSignalQuery,
  type UserSignalScope
} from "./user-signal-store";

export const REVIEWER_TRUST_STATES = [
  "trusted",
  "neutral",
  "low_trust",
  "muted",
  "blocked"
] as const;

export type ReviewerTrustState = (typeof REVIEWER_TRUST_STATES)[number];

const REVIEWER_SIGNAL_TYPES = [
  "trusted",
  "low_trust",
  "reviewer_muted",
  "reviewer_blocked"
] as const satisfies readonly UserSignalType[];

type ReviewerSignalType = (typeof REVIEWER_SIGNAL_TYPES)[number];

type ReviewerSignalReader = (query: UserSignalQuery) => Promise<UserRecommendationSignalDoc[]>;
type ReviewerSignalWriter = (input: UserSignalInput) => Promise<UserRecommendationSignalDoc>;
type ReviewerSignalRemover = (id: string, scope: UserSignalScope) => Promise<boolean>;

export type ReviewerTrustDependencies = {
  listSignals?: ReviewerSignalReader;
  writeSignal?: ReviewerSignalWriter;
  removeSignal?: ReviewerSignalRemover;
};

export type ReviewerTrustEffect = {
  state: ReviewerTrustState;
  scoreAdjustment: number;
  hardSuppressed: boolean;
};

export async function getReviewerTrustState(
  scope: UserSignalScope,
  reviewerAccountId: string,
  dependencies: ReviewerTrustDependencies = {},
  now = Date.now()
): Promise<ReviewerTrustState> {
  const signals = await (dependencies.listSignals ?? listUserSignals)({
    ...scope,
    entityType: "account",
    entityId: normalizeReviewerAccountId(reviewerAccountId),
    provenance: "user_explicit"
  });

  return selectReviewerTrustState(signals, now);
}

export async function setReviewerTrustState(
  scope: UserSignalScope,
  reviewerAccountId: string,
  state: ReviewerTrustState,
  dependencies: ReviewerTrustDependencies = {}
): Promise<ReviewerTrustState> {
  assertReviewerTrustState(state);
  const entityId = normalizeReviewerAccountId(reviewerAccountId);
  const listSignals = dependencies.listSignals ?? listUserSignals;
  const writeSignal = dependencies.writeSignal ?? ((input) => upsertUserSignal(input));
  const removeSignal = dependencies.removeSignal ?? removeUserSignal;

  const existing = await listSignals({
    ...scope,
    entityType: "account",
    entityId,
    provenance: "user_explicit"
  });
  const reviewerSignals = existing.filter((signal) => isReviewerSignalType(signal.signalType));

  if (state === "neutral") {
    for (const signal of reviewerSignals) {
      await removeSignal(signal.id, scope);
    }
    return "neutral";
  }

  const selectedType = stateToSignalType(state);
  await writeSignal({
    ...scope,
    entityType: "account",
    entityId,
    signalType: selectedType,
    strength: stateStrength(state),
    provenance: "user_explicit",
    reason: `Reviewer trust state: ${state}`
  });

  // Persist the new state before removing old states. If cleanup fails, effective
  // resolution remains conservative rather than silently relaxing suppression.
  for (const signal of reviewerSignals) {
    if (signal.signalType !== selectedType) {
      await removeSignal(signal.id, scope);
    }
  }

  return state;
}

export function selectReviewerTrustState(
  signals: readonly Pick<UserRecommendationSignalDoc, "signalType" | "expiresAt" | "updatedAt">[],
  now = Date.now()
): ReviewerTrustState {
  const active = signals
    .filter((signal) => isReviewerSignalType(signal.signalType))
    .filter((signal) => !isUserSignalExpired(signal as UserRecommendationSignalDoc, now));

  if (active.some((signal) => signal.signalType === "reviewer_blocked")) return "blocked";
  if (active.some((signal) => signal.signalType === "reviewer_muted")) return "muted";

  const latest = [...active].sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  )[0];

  if (latest?.signalType === "low_trust") return "low_trust";
  if (latest?.signalType === "trusted") return "trusted";
  return "neutral";
}

export function reviewerTrustEffect(state: ReviewerTrustState): ReviewerTrustEffect {
  switch (state) {
    case "trusted":
      return { state, scoreAdjustment: 0.2, hardSuppressed: false };
    case "low_trust":
      return { state, scoreAdjustment: -0.2, hardSuppressed: false };
    case "muted":
    case "blocked":
      return { state, scoreAdjustment: 0, hardSuppressed: true };
    case "neutral":
      return { state, scoreAdjustment: 0, hardSuppressed: false };
  }
}

function stateToSignalType(state: Exclude<ReviewerTrustState, "neutral">): ReviewerSignalType {
  switch (state) {
    case "trusted": return "trusted";
    case "low_trust": return "low_trust";
    case "muted": return "reviewer_muted";
    case "blocked": return "reviewer_blocked";
  }
}

function stateStrength(state: Exclude<ReviewerTrustState, "neutral">): number {
  switch (state) {
    case "trusted": return 0.5;
    case "low_trust": return -0.5;
    case "muted":
    case "blocked": return -1;
  }
}

function isReviewerSignalType(value: UserSignalType): value is ReviewerSignalType {
  return (REVIEWER_SIGNAL_TYPES as readonly string[]).includes(value);
}

function normalizeReviewerAccountId(value: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error("Reviewer account ID is required");
  if (normalized.length > 2048) throw new Error("Reviewer account ID is too long");
  return normalized;
}

function assertReviewerTrustState(value: string): asserts value is ReviewerTrustState {
  if (!(REVIEWER_TRUST_STATES as readonly string[]).includes(value)) {
    throw new Error("Invalid reviewer trust state");
  }
}
