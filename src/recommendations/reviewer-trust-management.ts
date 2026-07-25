import {
  getReviewerTrustState,
  REVIEWER_TRUST_STATES,
  setReviewerTrustState,
  type ReviewerTrustState
} from "./reviewer-trust";
import type { UserSignalScope } from "./user-signal-store";

export type ReviewerTrustManagementStatus = "idle" | "loading" | "ready" | "saving" | "error";

export type ReviewerTrustManagementSnapshot = {
  reviewerAccountId: string;
  state: ReviewerTrustState;
  persistedState: ReviewerTrustState;
  status: ReviewerTrustManagementStatus;
  error: Error | null;
  revision: number;
};

export type ReviewerTrustManagementDependencies = {
  readState?: (
    scope: UserSignalScope,
    reviewerAccountId: string
  ) => Promise<ReviewerTrustState>;
  writeState?: (
    scope: UserSignalScope,
    reviewerAccountId: string,
    state: ReviewerTrustState
  ) => Promise<ReviewerTrustState>;
};

export type ReviewerTrustManager = {
  getSnapshot(): ReviewerTrustManagementSnapshot;
  subscribe(listener: (snapshot: ReviewerTrustManagementSnapshot) => void): () => void;
  load(): Promise<ReviewerTrustManagementSnapshot>;
  setState(state: ReviewerTrustState): Promise<ReviewerTrustManagementSnapshot>;
  retry(): Promise<ReviewerTrustManagementSnapshot>;
  dispose(): void;
};

const MAX_REVIEWER_ID_LENGTH = 2048;

export function createReviewerTrustManager(
  scope: UserSignalScope,
  reviewerAccountId: string,
  dependencies: ReviewerTrustManagementDependencies = {}
): ReviewerTrustManager {
  const normalizedReviewerAccountId = normalizeReviewerAccountId(reviewerAccountId);
  const readState = dependencies.readState ?? getReviewerTrustState;
  const writeState = dependencies.writeState ?? setReviewerTrustState;
  const listeners = new Set<(snapshot: ReviewerTrustManagementSnapshot) => void>();

  let disposed = false;
  let operationRevision = 0;
  let mutationQueue: Promise<void> = Promise.resolve();
  let snapshot: ReviewerTrustManagementSnapshot = {
    reviewerAccountId: normalizedReviewerAccountId,
    state: "neutral",
    persistedState: "neutral",
    status: "idle",
    error: null,
    revision: 0
  };

  function publish(next: ReviewerTrustManagementSnapshot): ReviewerTrustManagementSnapshot {
    if (disposed) return snapshot;
    snapshot = Object.freeze({ ...next });
    for (const listener of [...listeners]) listener(snapshot);
    return snapshot;
  }

  async function load(): Promise<ReviewerTrustManagementSnapshot> {
    assertActive(disposed);
    const revision = ++operationRevision;
    publish({ ...snapshot, status: "loading", error: null, revision });

    try {
      const state = assertReviewerTrustState(await readState(scope, normalizedReviewerAccountId));
      if (disposed || revision !== operationRevision) return snapshot;
      return publish({
        reviewerAccountId: normalizedReviewerAccountId,
        state,
        persistedState: state,
        status: "ready",
        error: null,
        revision
      });
    } catch (cause) {
      if (disposed || revision !== operationRevision) return snapshot;
      return publish({
        ...snapshot,
        status: "error",
        error: toError(cause),
        revision
      });
    }
  }

  async function setState(nextState: ReviewerTrustState): Promise<ReviewerTrustManagementSnapshot> {
    assertActive(disposed);
    assertReviewerTrustState(nextState);

    const requestedState = nextState;
    let result: ReviewerTrustManagementSnapshot = snapshot;
    const queued = mutationQueue.then(async () => {
      assertActive(disposed);
      const revision = ++operationRevision;
      const rollbackState = snapshot.persistedState;

      publish({
        ...snapshot,
        state: requestedState,
        status: "saving",
        error: null,
        revision
      });

      try {
        const persistedState = assertReviewerTrustState(
          await writeState(scope, normalizedReviewerAccountId, requestedState)
        );
        if (disposed || revision !== operationRevision) {
          result = snapshot;
          return;
        }
        result = publish({
          reviewerAccountId: normalizedReviewerAccountId,
          state: persistedState,
          persistedState,
          status: "ready",
          error: null,
          revision
        });
      } catch (cause) {
        if (disposed || revision !== operationRevision) {
          result = snapshot;
          return;
        }
        result = publish({
          reviewerAccountId: normalizedReviewerAccountId,
          state: rollbackState,
          persistedState: rollbackState,
          status: "error",
          error: toError(cause),
          revision
        });
      }
    });

    mutationQueue = queued.catch(() => undefined);
    await queued;
    return result;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      assertActive(disposed);
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    load,
    setState,
    retry() {
      return snapshot.status === "error" ? load() : Promise.resolve(snapshot);
    },
    dispose() {
      disposed = true;
      operationRevision += 1;
      listeners.clear();
    }
  };
}

export function reviewerTrustStateLabel(state: ReviewerTrustState): string {
  switch (state) {
    case "trusted": return "Prioritize reviews";
    case "neutral": return "Use normally";
    case "low_trust": return "Show less influence";
    case "muted": return "Hide reviewed recommendations";
    case "blocked": return "Block reviewed recommendations";
  }
}

export function reviewerTrustStateDescription(state: ReviewerTrustState): string {
  switch (state) {
    case "trusted":
      return "Reviews from this account may slightly improve ranking, within a strict cap.";
    case "neutral":
      return "This account has no special effect on recommendation ranking.";
    case "low_trust":
      return "Reviews from this account may slightly reduce ranking, within a strict cap.";
    case "muted":
      return "Recommendations attributed to this reviewer are hidden from normal results.";
    case "blocked":
      return "Recommendations attributed to this reviewer are excluded from normal results.";
  }
}

export function listReviewerTrustOptions(): readonly {
  state: ReviewerTrustState;
  label: string;
  description: string;
  destructive: boolean;
}[] {
  return REVIEWER_TRUST_STATES.map((state) => ({
    state,
    label: reviewerTrustStateLabel(state),
    description: reviewerTrustStateDescription(state),
    destructive: state === "muted" || state === "blocked"
  }));
}

function normalizeReviewerAccountId(value: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error("Reviewer account ID is required");
  if (normalized.length > MAX_REVIEWER_ID_LENGTH) throw new Error("Reviewer account ID is too long");
  return normalized;
}

function assertReviewerTrustState(value: string): ReviewerTrustState {
  if (!(REVIEWER_TRUST_STATES as readonly string[]).includes(value)) {
    throw new Error("Invalid reviewer trust state");
  }
  return value as ReviewerTrustState;
}

function assertActive(disposed: boolean): void {
  if (disposed) throw new Error("Reviewer trust manager has been disposed");
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error("Reviewer trust operation failed");
}
