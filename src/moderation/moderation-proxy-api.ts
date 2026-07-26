export type RemoteAccount = { id: string; acct?: string; username?: string };
export type RemoteFilter = {
  id: string;
  title?: string;
  context?: string[];
  filter_action?: "warn" | "hide";
  expires_at?: string | null;
  keywords?: Array<{ id?: string; keyword: string; whole_word?: boolean }>;
};

export type RemoteModerationState = {
  mutes: RemoteAccount[];
  blocks: RemoteAccount[];
  domains: string[];
  filters: RemoteFilter[];
};

export type ModerationProxyAction =
  | { kind: "mute"; accountId: string; notifications?: boolean; duration?: number }
  | { kind: "unmute"; accountId: string }
  | { kind: "block"; accountId: string }
  | { kind: "unblock"; accountId: string }
  | { kind: "domain_block"; domain: string }
  | { kind: "domain_unblock"; domain: string }
  | { kind: "filter_create"; title: string; context: string[]; filterAction: "warn" | "hide"; keyword: string; wholeWord: boolean; expiresIn?: number }
  | { kind: "filter_delete"; filterId: string };

export class ModerationProxyError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
    message = "Moderation sync request failed"
  ) {
    super(message);
  }
}

const BASE = "/api/auth/mastodon/moderation";

export async function fetchRemoteModerationState(fetchImpl: typeof fetch = fetch): Promise<RemoteModerationState> {
  const [mutes, blocks, domains, filters] = await Promise.all([
    requestJson<RemoteAccount[]>(fetchImpl, `${BASE}/mutes?limit=80`),
    requestJson<RemoteAccount[]>(fetchImpl, `${BASE}/blocks?limit=80`),
    requestJson<string[]>(fetchImpl, `${BASE}/domain-blocks?limit=80`),
    requestJson<RemoteFilter[]>(fetchImpl, `${BASE}/filters`)
  ]);
  return { mutes, blocks, domains, filters };
}

export async function pushRemoteModerationAction(
  action: ModerationProxyAction,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  switch (action.kind) {
    case "mute":
      await requestJson(fetchImpl, `${BASE}/mute`, jsonPost({ accountId: action.accountId, notifications: action.notifications, duration: action.duration }));
      return;
    case "unmute":
      await requestJson(fetchImpl, `${BASE}/unmute`, jsonPost({ accountId: action.accountId }));
      return;
    case "block":
      await requestJson(fetchImpl, `${BASE}/block`, jsonPost({ accountId: action.accountId }));
      return;
    case "unblock":
      await requestJson(fetchImpl, `${BASE}/unblock`, jsonPost({ accountId: action.accountId }));
      return;
    case "domain_block":
      await requestJson(fetchImpl, `${BASE}/domain-block`, jsonPost({ domain: action.domain }));
      return;
    case "domain_unblock":
      await requestJson(fetchImpl, `${BASE}/domain-unblock`, jsonPost({ domain: action.domain }));
      return;
    case "filter_create":
      await requestJson(fetchImpl, `${BASE}/filters`, jsonPost({
        title: action.title,
        context: action.context,
        filter_action: action.filterAction,
        keywords_attributes: [{ keyword: action.keyword, whole_word: action.wholeWord }],
        ...(action.expiresIn ? { expires_in: action.expiresIn } : {})
      }));
      return;
    case "filter_delete":
      await requestJson(fetchImpl, `${BASE}/filters/${encodeURIComponent(action.filterId)}`, { method: "DELETE" });
  }
}

function jsonPost(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function requestJson<T = unknown>(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, { credentials: "same-origin", cache: "no-store", ...init });
  if (!response.ok) {
    throw new ModerationProxyError(response.status, response.status === 408 || response.status === 429 || response.status >= 500);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
