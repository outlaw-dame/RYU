import {
  createReviewerTrustManager,
  type ReviewerTrustManagementSnapshot,
  type ReviewerTrustManager
} from "./reviewer-trust-management";
import type { ReviewerTrustState } from "./reviewer-trust";
import type { UserSignalScope } from "./user-signal-store";

export type ReviewerTrustListener = (snapshot: ReviewerTrustManagementSnapshot) => void;
export type ReviewerTrustInvalidationListener = () => void;

type RegistryEntry = {
  manager: ReviewerTrustManager;
  subscribers: number;
  loaded: boolean;
  lastPersistedState: ReviewerTrustState;
};

const registry = new Map<string, RegistryEntry>();
const invalidationListeners = new Set<ReviewerTrustInvalidationListener>();

export function subscribeSharedReviewerTrust(
  scope: UserSignalScope,
  reviewerAccountId: string,
  listener: ReviewerTrustListener
): () => void {
  const key = registryKey(scope, reviewerAccountId);
  let entry = registry.get(key);
  if (!entry) {
    const manager = createReviewerTrustManager(scope, reviewerAccountId);
    entry = {
      manager,
      subscribers: 0,
      loaded: false,
      lastPersistedState: manager.getSnapshot().persistedState
    };
    registry.set(key, entry);
  }

  entry.subscribers += 1;
  const unsubscribe = entry.manager.subscribe((snapshot) => {
    const persistedChanged = snapshot.status === "ready"
      && snapshot.persistedState !== entry!.lastPersistedState;
    entry!.lastPersistedState = snapshot.persistedState;
    listener(snapshot);
    if (persistedChanged) notifyInvalidation();
  });

  if (!entry.loaded) {
    entry.loaded = true;
    void entry.manager.load();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    unsubscribe();
    entry!.subscribers = Math.max(0, entry!.subscribers - 1);

    // React Strict Mode probes setup -> cleanup -> setup synchronously. Delay
    // disposal one microtask so the second setup can retain the same manager.
    queueMicrotask(() => {
      const current = registry.get(key);
      if (current !== entry || current.subscribers > 0) return;
      current.manager.dispose();
      registry.delete(key);
    });
  };
}

export async function setSharedReviewerTrustState(
  scope: UserSignalScope,
  reviewerAccountId: string,
  state: ReviewerTrustState
): Promise<ReviewerTrustManagementSnapshot> {
  const key = registryKey(scope, reviewerAccountId);
  const entry = registry.get(key);
  if (entry) return entry.manager.setState(state);

  // A write may originate while the control is transitioning between mounts.
  // Use a short-lived manager rather than accepting scope or identity from UI.
  const manager = createReviewerTrustManager(scope, reviewerAccountId);
  try {
    const result = await manager.setState(state);
    if (result.status === "ready") notifyInvalidation();
    return result;
  } finally {
    manager.dispose();
  }
}

export function subscribeReviewerTrustInvalidation(
  listener: ReviewerTrustInvalidationListener
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

function notifyInvalidation(): void {
  for (const listener of [...invalidationListeners]) listener();
}

function registryKey(scope: UserSignalScope, reviewerAccountId: string): string {
  return JSON.stringify([
    scope.ownerAccountId,
    scope.instanceOrigin,
    reviewerAccountId.trim()
  ]);
}
