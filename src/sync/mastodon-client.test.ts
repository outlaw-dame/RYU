import { describe, expect, it, vi } from "vitest";

vi.mock("../db/fetch-queue-persistence", () => ({
  persistFetchQueueStatus: vi.fn()
}));

import { MastodonApiResponseError, MastodonClient, parseMastodonLinkHeader } from "./mastodon-client";

const statusPayload = {
  id: "101",
  uri: "https://books.example/users/reader/statuses/101",
  url: "https://books.example/@reader/101",
  created_at: "2026-04-28T12:00:00.000Z",
  content: "<p>A tidy review.</p>",
  account: {
    id: "7",
    username: "reader",
    acct: "reader@books.example"
  }
};

describe("MastodonClient", () => {
  it("fetches the authenticated home timeline with pagination", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([statusPayload], {
      Link: '<https://books.example/api/v1/timelines/home?max_id=100&limit=20>; rel="next"'
    }));
    const client = new MastodonClient({
      instanceOrigin: "https://books.example",
      accessToken: "token-123",
      fetchImpl,
      queueOptions: { retries: 0, jitterMs: 0, persistStatus: false }
    });

    const page = await client.fetchHomeTimeline({ limit: 20 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://books.example/api/v1/timelines/home?limit=20");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer token-123"
    });
    expect(page.items).toEqual([statusPayload]);
    expect(page.links.next).toEqual({ maxId: "100", sinceId: undefined, minId: undefined, limit: 20 });
  });

  it("fetches notifications with Mastodon array query parameters", async () => {
    const notificationPayload = {
      id: "201",
      type: "favourite",
      created_at: "2026-04-28T13:00:00.000Z",
      account: statusPayload.account,
      status: statusPayload
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([notificationPayload]));
    const client = new MastodonClient({
      instanceOrigin: "https://books.example",
      accessToken: "token-123",
      fetchImpl,
      queueOptions: { retries: 0, jitterMs: 0, persistStatus: false }
    });

    const page = await client.fetchNotifications({ types: ["favourite", "mention"], excludeTypes: ["follow"] });

    const [url] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.getAll("types[]")).toEqual(["favourite", "mention"]);
    expect(url.searchParams.getAll("exclude_types[]")).toEqual(["follow"]);
    expect(page.items).toEqual([notificationPayload]);
  });

  it("surfaces non-ok responses as retry-aware Mastodon API errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "2" }
    }));
    const client = new MastodonClient({
      instanceOrigin: "https://books.example",
      accessToken: "token-123",
      fetchImpl,
      queueOptions: { retries: 0, jitterMs: 0, persistStatus: false }
    });

    await expect(client.fetchHomeTimeline()).rejects.toMatchObject({
      status: 429,
      retryable: true,
      responseText: "rate limited",
      retryAfterMs: 2000
    } satisfies Partial<MastodonApiResponseError>);
  });
});

describe("parseMastodonLinkHeader", () => {
  it("extracts next and previous pagination cursors", () => {
    expect(parseMastodonLinkHeader([
      '<https://books.example/api/v1/notifications?max_id=20>; rel="next"',
      '<https://books.example/api/v1/notifications?min_id=30>; rel="prev"'
    ].join(", "))).toEqual({
      nextUrl: "https://books.example/api/v1/notifications?max_id=20",
      next: { maxId: "20", sinceId: undefined, minId: undefined, limit: undefined },
      prevUrl: "https://books.example/api/v1/notifications?min_id=30",
      prev: { maxId: undefined, sinceId: undefined, minId: "30", limit: undefined }
    });
  });
});

function jsonResponse(payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
