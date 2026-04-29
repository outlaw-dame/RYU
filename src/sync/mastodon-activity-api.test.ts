import { describe, expect, it, vi } from "vitest";
import {
  disconnectMastodon,
  getAccountStatuses,
  getBookTokTrends,
  getHomeTimeline,
  getMastodonSession,
  getNotifications
} from "./mastodon-activity-api";

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

describe("mastodon-activity-api", () => {
  it("loads session state without exposing tokens", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      connected: true,
      instanceOrigin: "https://social.example",
      account: { id: "1", acct: "reader@social.example" },
      scope: "profile read"
    }));

    const session = await getMastodonSession({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("/api/auth/mastodon/session", expect.objectContaining({ method: "GET" }));
    expect(session.connected).toBe(true);
    expect(session.account?.acct).toBe("reader@social.example");
    expect(JSON.stringify(session)).not.toContain("access_token");
  });

  it("loads timeline, notifications, account statuses, and trends through same-origin proxy paths", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith("/api/auth/mastodon/timelines/home")) {
        return jsonResponse({ items: [statusPayload("41")], links: {} });
      }
      if (path.startsWith("/api/auth/mastodon/notifications")) {
        return jsonResponse({ items: [{ id: "51", type: "favourite", created_at: "2026-04-29T00:00:00.000Z", account: accountPayload("2") }], links: {} });
      }
      if (path.startsWith("/api/auth/mastodon/account/statuses")) {
        return jsonResponse({ items: [statusPayload("61")], links: {} });
      }
      if (path === "/api/trends/booktok") {
        return jsonResponse({ items: [{ id: "trend-1", title: "Cozy fantasy", reason: "Warm reads", mentionCount: 1 }] });
      }
      throw new Error(`unexpected path ${path}`);
    });

    await expect(getHomeTimeline({ limit: 5 }, { fetchImpl })).resolves.toMatchObject({ items: [{ id: "41" }] });
    await expect(getNotifications({ limit: 5 }, { fetchImpl })).resolves.toMatchObject({ items: [{ id: "51" }] });
    await expect(getAccountStatuses({ limit: 5 }, { fetchImpl })).resolves.toMatchObject({ items: [{ id: "61" }] });
    await expect(getBookTokTrends({ fetchImpl })).resolves.toMatchObject([{ id: "trend-1" }]);
    await expect(disconnectMastodon({ fetchImpl })).resolves.toBeUndefined();

    for (const call of fetchImpl.mock.calls) {
      expect(String(call[0]).startsWith("/")).toBe(true);
      expect(String(call[0]).startsWith("http")).toBe(false);
    }
  });

  it("does not retry authentication failures", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "not_authenticated", message: "Reconnect" }, { status: 401 }));

    await expect(getHomeTimeline({}, { fetchImpl, sleep: async () => undefined })).rejects.toMatchObject({
      status: 401,
      code: "not_authenticated"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After for rate limits", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "mastodon_rate_limited" }, { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(jsonResponse({ items: [statusPayload("42")], links: {} }));

    const page = await getHomeTimeline({}, {
      fetchImpl,
      attempts: 2,
      sleep: async (ms) => { sleeps.push(ms); }
    });

    expect(page.items[0]?.id).toBe("42");
    expect(sleeps).toEqual([2000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

function accountPayload(id: string) {
  return { id, username: `reader${id}`, acct: `reader${id}@social.example` };
}

function statusPayload(id: string) {
  return {
    id,
    uri: `https://social.example/users/reader/statuses/${id}`,
    url: `https://social.example/@reader/${id}`,
    created_at: "2026-04-29T00:00:00.000Z",
    content: "<p>Hello</p>",
    account: accountPayload("1")
  };
}
