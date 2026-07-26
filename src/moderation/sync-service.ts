import {
  fetchRemoteModerationState,
  pushRemoteModerationAction,
  ModerationProxyError,
  type ModerationProxyAction,
  type RemoteModerationState
} from "./moderation-proxy-api";
import {
  loadModerationQueue,
  replaceModerationQueue,
  type ModerationQueueItem
} from "./sync-queue";

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const inFlight = new Map<string, Promise<ModerationSyncResult>>();

export type ModerationSyncResult = {
  drained: number;
  remaining: number;
  dropped: number;
  remoteState: RemoteModerationState | null;
};

export type ModerationSyncOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  applyRemoteState?: (state: RemoteModerationState) => void | Promise<void>;
};

export function computeModerationBackoff(attempts: number, random = Math.random): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** Math.max(0, attempts - 1)));
  return Math.floor(Math.max(0, Math.min(1, random())) * ceiling);
}

export async function drainModerationQueue(
  ownerAccountId: string,
  options: ModerationSyncOptions = {}
): Promise<Omit<ModerationSyncResult, "remoteState">> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const queue = loadModerationQueue(ownerAccountId);
  const remaining: ModerationQueueItem[] = [];
  let drained = 0;
  let dropped = 0;

  for (const item of queue) {
    if (item.nextAttemptAt > now()) {
      remaining.push(item);
      continue;
    }

    try {
      await pushRemoteModerationAction(item.action, fetchImpl);
      drained += 1;
    } catch (error) {
      const retryable = error instanceof ModerationProxyError ? error.retryable : true;
      const attempts = item.attempts + 1;
      if (!retryable || attempts >= MAX_ATTEMPTS) {
        dropped += 1;
        continue;
      }
      remaining.push({
        ...item,
        attempts,
        nextAttemptAt: now() + computeModerationBackoff(attempts, random)
      });
    }
  }

  replaceModerationQueue(ownerAccountId, remaining);
  return { drained, remaining: remaining.length, dropped };
}

export function syncModerationState(
  ownerAccountId: string,
  options: ModerationSyncOptions = {}
): Promise<ModerationSyncResult> {
  const owner = ownerAccountId.trim();
  if (!owner) return Promise.resolve({ drained: 0, remaining: 0, dropped: 0, remoteState: null });
  const existing = inFlight.get(owner);
  if (existing) return existing;

  const task = runSync(owner, options).finally(() => {
    if (inFlight.get(owner) === task) inFlight.delete(owner);
  });
  inFlight.set(owner, task);
  return task;
}

async function runSync(owner: string, options: ModerationSyncOptions): Promise<ModerationSyncResult> {
  const drained = await drainModerationQueue(owner, options);
  let remoteState: RemoteModerationState | null = null;
  try {
    remoteState = await fetchRemoteModerationState(options.fetchImpl ?? fetch);
    await options.applyRemoteState?.(remoteState);
  } catch (error) {
    if (!(error instanceof ModerationProxyError) || !error.retryable) throw error;
  }
  return { ...drained, remoteState };
}

export async function pushOrQueueModerationAction(
  ownerAccountId: string,
  action: ModerationProxyAction,
  enqueue: (owner: string, action: ModerationProxyAction) => unknown,
  options: Pick<ModerationSyncOptions, "fetchImpl"> = {}
): Promise<"pushed" | "queued"> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue(ownerAccountId, action);
    return "queued";
  }
  try {
    await pushRemoteModerationAction(action, options.fetchImpl ?? fetch);
    return "pushed";
  } catch (error) {
    if (error instanceof ModerationProxyError && !error.retryable) throw error;
    enqueue(ownerAccountId, action);
    return "queued";
  }
}
