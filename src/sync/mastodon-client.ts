import { z, type ZodType } from "zod";
import { FetchQueue, type FetchQueueOptions } from "./fetch-queue";

type MastodonFetch = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

export type MastodonClientOptions = {
  instanceOrigin: string;
  accessToken: string;
  tokenType?: string;
  fetchImpl?: MastodonFetch;
  queueOptions?: FetchQueueOptions;
};

export type MastodonPaginationParams = {
  limit?: number;
  maxId?: string;
  sinceId?: string;
  minId?: string;
};

export type MastodonAccountStatusesParams = MastodonPaginationParams & {
  onlyMedia?: boolean;
  excludeReplies?: boolean;
  excludeReblogs?: boolean;
  pinned?: boolean;
  tagged?: string;
};

export type MastodonNotificationsParams = MastodonPaginationParams & {
  accountId?: string;
  types?: string[];
  excludeTypes?: string[];
};

export type MastodonSearchStatusesParams = {
  query: string;
  limit?: number;
  resolve?: boolean;
};

export type MastodonPaginationLinks = {
  next?: MastodonPaginationParams;
  prev?: MastodonPaginationParams;
  nextUrl?: string;
  prevUrl?: string;
};

export type MastodonPage<T> = {
  items: T[];
  links: MastodonPaginationLinks;
};

export const mastodonAccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().optional(),
  acct: z.string().optional(),
  display_name: z.string().optional(),
  url: z.string().nullable().optional(),
  avatar: z.string().nullable().optional()
}).passthrough();

export const mastodonStatusSchema = z.object({
  id: z.string().min(1),
  uri: z.string().optional(),
  url: z.string().nullable().optional(),
  created_at: z.string().min(1),
  account: mastodonAccountSchema,
  content: z.string().optional(),
  visibility: z.string().optional(),
  sensitive: z.boolean().optional(),
  spoiler_text: z.string().optional(),
  in_reply_to_id: z.string().nullable().optional(),
  in_reply_to_account_id: z.string().nullable().optional(),
  reblogs_count: z.number().optional(),
  favourites_count: z.number().optional(),
  replies_count: z.number().optional(),
  reblog: z.unknown().nullable().optional(),
  favourited: z.boolean().optional(),
  bookmarked: z.boolean().optional(),
  reblogged: z.boolean().optional()
}).passthrough();

export const mastodonAccountFullSchema = mastodonAccountSchema.extend({
  note: z.string().optional(),
  followers_count: z.number().int().min(0).optional(),
  following_count: z.number().int().min(0).optional(),
  statuses_count: z.number().int().min(0).optional(),
  header: z.string().nullable().optional(),
  fields: z.array(z.object({
    name: z.string(),
    value: z.string(),
    verified_at: z.string().nullable().optional()
  }).passthrough()).optional()
});

export const mastodonNotificationSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created_at: z.string().min(1),
  account: mastodonAccountSchema,
  status: mastodonStatusSchema.nullable().optional()
}).passthrough();

export const mastodonListSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  replies_policy: z.string().optional()
}).passthrough();

export type MastodonAccount = z.infer<typeof mastodonAccountSchema>;
export type MastodonAccountFull = z.infer<typeof mastodonAccountFullSchema>;
export type MastodonStatus = z.infer<typeof mastodonStatusSchema>;
export type MastodonNotification = z.infer<typeof mastodonNotificationSchema>;
export type MastodonList = z.infer<typeof mastodonListSchema>;

export type MastodonPostStatusParams = {
  status: string;
  visibility?: "public" | "unlisted" | "private" | "direct";
  spoilerText?: string;
  inReplyToId?: string;
  sensitive?: boolean;
};

export function validateStatusId(id: string): string {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed || !/^[\w-]{1,64}$/.test(trimmed)) {
    throw new Error("Invalid Mastodon status ID");
  }
  return trimmed;
}

export class MastodonApiResponseError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    readonly url: string,
    readonly status: number,
    readonly responseText?: string,
    options: { retryAfterMs?: number } = {}
  ) {
    const detail = responseText ? `: ${responseText}` : "";
    super(`Mastodon API request failed ${url}: ${status}${detail}`);
    this.retryable = status === 408 || status === 425 || status === 429 || status >= 500;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class MastodonClient {
  private readonly instanceOrigin: string;
  private readonly authorizationHeader: string;
  private readonly fetchImpl: MastodonFetch;
  private readonly queue: FetchQueue;

  constructor(options: MastodonClientOptions) {
    this.instanceOrigin = normalizeInstanceOrigin(options.instanceOrigin);
    this.authorizationHeader = `${options.tokenType ?? "Bearer"} ${options.accessToken}`;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.queue = new FetchQueue({
      concurrency: 4,
      perHostConcurrency: 2,
      retries: 2,
      timeoutMs: 10_000,
      ...options.queueOptions
    });
  }

  fetchHomeTimeline(params: MastodonPaginationParams = {}): Promise<MastodonPage<MastodonStatus>> {
    return this.fetchArray("/api/v1/timelines/home", mastodonStatusSchema, params);
  }

  fetchAccountStatuses(accountId: string, params: MastodonAccountStatusesParams = {}): Promise<MastodonPage<MastodonStatus>> {
    return this.fetchArray(`/api/v1/accounts/${encodeURIComponent(accountId)}/statuses`, mastodonStatusSchema, params);
  }

  fetchNotifications(params: MastodonNotificationsParams = {}): Promise<MastodonPage<MastodonNotification>> {
    return this.fetchArray("/api/v1/notifications", mastodonNotificationSchema, params);
  }

  async fetchSearchStatuses(params: MastodonSearchStatusesParams): Promise<MastodonStatus[]> {
    const url = this.buildUrl("/api/v2/search", {
      q: params.query,
      type: "statuses",
      limit: params.limit,
      resolve: params.resolve ?? false
    });

    const { json } = await this.queue.run(url.toString(), (signal) => this.fetchJson(url, signal), {
      host: url.host
    });

    const parsed = z.object({
      statuses: z.array(mastodonStatusSchema).default([])
    }).parse(json);

    return parsed.statuses;
  }

  fetchBookmarks(params: MastodonPaginationParams = {}): Promise<MastodonPage<MastodonStatus>> {
    return this.fetchArray("/api/v1/bookmarks", mastodonStatusSchema, params);
  }

  fetchFavourites(params: MastodonPaginationParams = {}): Promise<MastodonPage<MastodonStatus>> {
    return this.fetchArray("/api/v1/favourites", mastodonStatusSchema, params);
  }

  async fetchLists(): Promise<MastodonList[]> {
    const page = await this.fetchArray("/api/v1/lists", mastodonListSchema, {});
    return page.items;
  }

  async verifyCredentials(): Promise<MastodonAccountFull> {
    const url = this.buildUrl("/api/v1/accounts/verify_credentials", {});
    const { json } = await this.queue.run(
      url.toString(),
      (signal) => this.fetchJson(url, signal),
      { host: url.host }
    );
    return mastodonAccountFullSchema.parse(json);
  }

  async fetchAccountById(accountId: string): Promise<MastodonAccountFull> {
    const trimmed = accountId.trim();
    if (!trimmed || !/^[\w-]{1,64}$/.test(trimmed)) {
      throw new Error("Invalid Mastodon account ID");
    }

    const url = this.buildUrl(`/api/v1/accounts/${encodeURIComponent(trimmed)}`, {});
    const { json } = await this.queue.run(
      url.toString(),
      (signal) => this.fetchJson(url, signal),
      { host: url.host }
    );
    return mastodonAccountFullSchema.parse(json);
  }

  async favouriteStatus(id: string): Promise<MastodonStatus> {
    return this.statusAction(validateStatusId(id), "favourite");
  }

  async unfavouriteStatus(id: string): Promise<MastodonStatus> {
    return this.statusAction(validateStatusId(id), "unfavourite");
  }

  async bookmarkStatus(id: string): Promise<MastodonStatus> {
    return this.statusAction(validateStatusId(id), "bookmark");
  }

  async unbookmarkStatus(id: string): Promise<MastodonStatus> {
    return this.statusAction(validateStatusId(id), "unbookmark");
  }

  async postStatus(params: MastodonPostStatusParams): Promise<MastodonStatus> {
    const content = params.status.trim();
    if (!content) throw new Error("Status content cannot be empty");
    if (content.length > 500) throw new Error("Status content exceeds 500 characters");

    const url = this.buildUrl("/api/v1/statuses", {});
    const body: Record<string, unknown> = {
      status: content,
      visibility: params.visibility ?? "public"
    };
    if (params.spoilerText?.trim()) body.spoiler_text = params.spoilerText.trim();
    if (params.inReplyToId) body.in_reply_to_id = validateStatusId(params.inReplyToId);
    if (params.sensitive != null) body.sensitive = params.sensitive;

    // Unique key prevents queue from deduplicating distinct post calls.
    const mutationKey = `post:${url.toString()}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
    const { json } = await this.queue.run(
      mutationKey,
      (signal) => this.mutate(url, "POST", body, signal),
      { host: url.host, retries: 0, persistStatus: false }
    );
    return mastodonStatusSchema.parse(json);
  }

  async deleteStatus(id: string): Promise<void> {
    const safeId = validateStatusId(id);
    const url = this.buildUrl(`/api/v1/statuses/${encodeURIComponent(safeId)}`, {});
    const mutationKey = `delete:${url.toString()}:${Date.now()}`;
    await this.queue.run(
      mutationKey,
      (signal) => this.mutate(url, "DELETE", undefined, signal),
      { host: url.host, retries: 1, persistStatus: false }
    );
  }

  private async statusAction(
    id: string,
    action: "favourite" | "unfavourite" | "bookmark" | "unbookmark"
  ): Promise<MastodonStatus> {
    const url = this.buildUrl(`/api/v1/statuses/${encodeURIComponent(id)}/${action}`, {});
    // Deduplicates rapid double-taps on the same action; idempotent so safe to retry once.
    const { json } = await this.queue.run(
      `${action}:${url.toString()}`,
      (signal) => this.mutate(url, "POST", undefined, signal),
      { host: url.host, retries: 1, persistStatus: false }
    );
    return mastodonStatusSchema.parse(json);
  }

  private async mutate(
    url: URL,
    method: "POST" | "DELETE",
    body: Record<string, unknown> | undefined,
    signal: AbortSignal
  ): Promise<{ json: unknown; links: MastodonPaginationLinks }> {
    const response = await this.fetchImpl(url, {
      method,
      signal,
      headers: {
        Accept: "application/json",
        Authorization: this.authorizationHeader,
        ...(body != null ? { "Content-Type": "application/json" } : {})
      },
      ...(body != null ? { body: JSON.stringify(body) } : {})
    });

    if (!response.ok) {
      throw new MastodonApiResponseError(
        url.toString(),
        response.status,
        sanitizeResponseText(await response.text().catch(() => "")),
        { retryAfterMs: parseRetryAfterMs(response.headers.get("Retry-After")) }
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return { json: {}, links: {} };
    }

    return {
      json: await response.json(),
      links: parseMastodonLinkHeader(response.headers.get("Link"))
    };
  }

  private async fetchArray<T>(path: string, itemSchema: ZodType<T>, params: Record<string, unknown>): Promise<MastodonPage<T>> {
    const url = this.buildUrl(path, params);
    const { json, links } = await this.queue.run(url.toString(), (signal) => this.fetchJson(url, signal), {
      host: url.host
    });

    return {
      items: z.array(itemSchema).parse(json),
      links
    };
  }

  private buildUrl(path: string, params: Record<string, unknown>): URL {
    const url = new URL(path, this.instanceOrigin);
    appendParams(url, params);
    return url;
  }

  private async fetchJson(url: URL, signal: AbortSignal): Promise<{ json: unknown; links: MastodonPaginationLinks }> {
    const response = await this.fetchImpl(url, {
      signal,
      headers: {
        Accept: "application/json",
        Authorization: this.authorizationHeader
      }
    });

    if (!response.ok) {
      throw new MastodonApiResponseError(
        url.toString(),
        response.status,
        sanitizeResponseText(await response.text().catch(() => "")),
        { retryAfterMs: parseRetryAfterMs(response.headers.get("Retry-After")) }
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Invalid Mastodon API response content type: ${contentType || "unknown"}`);
    }

    return {
      json: await response.json(),
      links: parseMastodonLinkHeader(response.headers.get("Link"))
    };
  }
}

export function parseMastodonLinkHeader(header: string | null): MastodonPaginationLinks {
  const links: MastodonPaginationLinks = {};
  if (!header) return links;

  for (const part of header.split(",")) {
    const urlMatch = part.trim().match(/<([^>]+)>/);
    const relMatch = part.trim().match(/;\s*rel="?([^";]+)"?/);
    if (!urlMatch || !relMatch) continue;

    const [, rawUrl] = urlMatch;
    const [, rel] = relMatch;
    if (rel !== "next" && rel !== "prev") continue;

    const params = parsePaginationParams(rawUrl);
    if (rel === "next") {
      links.nextUrl = rawUrl;
      links.next = params;
    } else {
      links.prevUrl = rawUrl;
      links.prev = params;
    }
  }

  return links;
}

function appendParams(url: URL, params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;

    const apiKey = toMastodonParamName(key);
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(`${apiKey}[]`, String(item));
      }
      continue;
    }

    url.searchParams.set(apiKey, String(value));
  }
}

function parsePaginationParams(rawUrl: string): MastodonPaginationParams {
  try {
    const url = new URL(rawUrl);
    return {
      maxId: url.searchParams.get("max_id") ?? undefined,
      sinceId: url.searchParams.get("since_id") ?? undefined,
      minId: url.searchParams.get("min_id") ?? undefined,
      limit: parseOptionalNumber(url.searchParams.get("limit"))
    };
  } catch {
    return {};
  }
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toMastodonParamName(key: string): string {
  switch (key) {
    case "maxId":
      return "max_id";
    case "sinceId":
      return "since_id";
    case "minId":
      return "min_id";
    case "onlyMedia":
      return "only_media";
    case "excludeReplies":
      return "exclude_replies";
    case "excludeReblogs":
      return "exclude_reblogs";
    case "accountId":
      return "account_id";
    case "excludeTypes":
      return "exclude_types";
    default:
      return key;
  }
}

function normalizeInstanceOrigin(input: string): string {
  const parsed = new URL(input);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Instance must use HTTPS (except localhost for development)");
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function sanitizeResponseText(text: string): string | undefined {
  const sanitized = text.slice(0, 400).replace(/[\r\n\t]+/g, " ").trim();
  return sanitized || undefined;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) {
    return undefined;
  }

  return Math.max(0, dateMs - Date.now());
}
