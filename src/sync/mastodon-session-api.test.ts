import { describe, expect, it } from "vitest";
import {
  parseMastodonNotificationPageResponse,
  parseMastodonStatusPageResponse
} from "./mastodon-session-api";

describe("mastodon-session-api", () => {
  it("parses status page payloads", async () => {
    const response = new Response(JSON.stringify({
      items: [{
        id: "41",
        uri: "https://social.example/@reader/41",
        url: "https://social.example/@reader/41",
        created_at: "2026-04-28T12:00:00.000Z",
        content: "<p>Hello</p>",
        account: {
          id: "1",
          username: "reader",
          acct: "reader@social.example"
        }
      }],
      links: {
        next: {
          maxId: "40"
        }
      }
    }), { status: 200 });

    const parsed = await parseMastodonStatusPageResponse(response);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.links.next?.maxId).toBe("40");
  });

  it("parses notification page payloads", async () => {
    const response = new Response(JSON.stringify({
      items: [{
        id: "51",
        type: "favourite",
        created_at: "2026-04-28T12:01:00.000Z",
        account: {
          id: "2",
          username: "fan",
          acct: "fan@social.example"
        }
      }],
      links: {}
    }), { status: 200 });

    const parsed = await parseMastodonNotificationPageResponse(response);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.type).toBe("favourite");
  });

  it("maps non-ok responses to MastodonSessionApiError", async () => {
    const response = new Response(JSON.stringify({
      error: "not_authenticated",
      message: "Sign in first"
    }), { status: 401 });

    await expect(parseMastodonStatusPageResponse(response)).rejects.toMatchObject({
      status: 401,
      code: "not_authenticated"
    });
  });
});