import {
  deferModerationQueueItem,
  loadModerationQueue,
  removeModerationQueueItem,
  type ModerationQueueItem
} from "./offline-queue";

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;

export type ModerationReplayResult = {
  processed: number;
  succeeded: number;
  deferred: number;
  blocked: number;
};

export type ModerationTransport = (item: ModerationQueueItem, signal: AbortSignal) => Promise<Response>;

function endpointFor(item: ModerationQueueItem): { url: string; init: RequestInit } {
  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  switch (item.type) {
    case "mute":
      return { url: "/api/auth/mastodon/moderation/mute", init: json({
        accountId: item.payload.accountId,
        notifications: item.payload.notifications,
        duration: item.payload.durationSeconds
      }) };
    case "unmute":
      return { url: "/api/auth/mastodon/moderation/unmute", init: json({ accountId: item.payload.accountId }) };
    case "block":
      return { url: "/api/auth/mastodon/moderation/block", init: json({ accountId: item.payload.accountId }) };
    case "unblock":
      return { url: "/api/auth/mastodon/moderation/unblock", init: json({ accountId: item.payload.accountId }) };
    case "domain_block":
      return { url: "/api/auth/mastodon/moderation/domain-block", init: json({ domain: item.payload.domain }) };
    case "domain_unblock":
      return { url: "/api/auth/mastodon/moderation/domain-unblock", init: json({ domain: item.payload.domain }) };
    case "filter_create":
      return { url: "/api/auth/mastodon/moderation/filters", init: json({
        phrase: item.payload.phrase,
        wholeWord: item.payload.wholeWord,
        action: item.payload.action,
        duration: item.payload.durationSeconds
      }) };
    case "filter_delete":
      return { url: "/api/auth/mastodon/moderation/filters/delete", init: json({ filterId: item.payload.filterId }) };
  }
}

export const defaultModerationTransport: ModerationTransport = async (item, signal) => {
  const { url, init } = endpointFor(item);
  return fetch(url, {
    ...init,
    signal,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      "X-RYU-Queue-Item": item.id
    }
  });
};

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("Retry-After");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_BACKOFF_MS, seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, Math.min(MAX_BACKOFF_MS, date - Date.now()));
}

export function moderationBackoffMs(attempts: number, random = Math.random): number {
  const cap = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(10, attempts));
  return Math.floor(random() * cap);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function errorCode(status: number): string {
  if (status === 401 || status === 403) return "authorization";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return `http_${status}`;
}

async function sendOne(item: ModerationQueueItem, transport: ModerationTransport): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await transport(item, controller.signal);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function replayModerationQueue(
  ownerAccountId: string,
  options: { transport?: ModerationTransport; now?: Date; maxItems?: number } = {}
): Promise<ModerationReplayResult> {
  const owner = ownerAccountId.trim();
  const transport = options.transport ?? defaultModerationTransport;
  const now = options.now ?? new Date();
  const maxItems = Math.max(1, Math.min(100, options.maxItems ?? 25));
  const due = loadModerationQueue(owner)
    .filter((item) => Date.parse(item.nextAttemptAt) <= now.getTime())
    .slice(0, maxItems);

  const result: ModerationReplayResult = { processed: 0, succeeded: 0, deferred: 0, blocked: 0 };
  for (const item of due) {
    result.processed += 1;
    try {
      const response = await sendOne(item, transport);
      if (response.ok || response.status === 404 || response.status === 409) {
        removeModerationQueueItem(owner, item.id);
        result.succeeded += 1;
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        deferModerationQueueItem(owner, item.id, new Date(now.getTime() + MAX_BACKOFF_MS), errorCode(response.status));
        result.blocked += 1;
        break;
      }

      if (isRetryableStatus(response.status)) {
        const delay = retryAfterMs(response) ?? moderationBackoffMs(item.attempts + 1);
        deferModerationQueueItem(owner, item.id, new Date(now.getTime() + delay), errorCode(response.status));
        result.deferred += 1;
        continue;
      }

      // Validation and unsupported-operation responses are terminal; replaying
      // them would create an infinite local queue and duplicate user intent.
      removeModerationQueueItem(owner, item.id);
      result.blocked += 1;
    } catch (error) {
      const delay = moderationBackoffMs(item.attempts + 1);
      const code = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network";
      deferModerationQueueItem(owner, item.id, new Date(now.getTime() + delay), code);
      result.deferred += 1;
    }
  }
  return result;
}

const activeReplays = new Map<string, Promise<ModerationReplayResult>>();

export function scheduleModerationReplay(ownerAccountId: string): Promise<ModerationReplayResult> {
  const owner = ownerAccountId.trim();
  if (!owner) return Promise.resolve({ processed: 0, succeeded: 0, deferred: 0, blocked: 0 });
  const existing = activeReplays.get(owner);
  if (existing) return existing;
  const replay = replayModerationQueue(owner).finally(() => activeReplays.delete(owner));
  activeReplays.set(owner, replay);
  return replay;
}

export function startModerationReplayCoordinator(ownerAccountId: string): () => void {
  const owner = ownerAccountId.trim();
  if (!owner || typeof window === "undefined") return () => {};
  const replay = () => {
    if (typeof navigator === "undefined" || navigator.onLine) void scheduleModerationReplay(owner);
  };
  window.addEventListener("online", replay);
  window.addEventListener("ryu:moderation-queue-sync", replay);
  replay();
  return () => {
    window.removeEventListener("online", replay);
    window.removeEventListener("ryu:moderation-queue-sync", replay);
  };
}
