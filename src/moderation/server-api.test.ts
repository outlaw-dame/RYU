import { describe, expect, it, vi } from "vitest";
import {
  fetchServerMutes,
  fetchServerBlocks,
  fetchServerDomainBlocks,
  serverMuteAccount,
  serverUnmuteAccount,
  serverBlockAccount,
  serverUnblockAccount,
  serverBlockDomain,
  serverUnblockDomain,
  ModerationServerApiError
} from "./server-api";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function errorResponse(status: number, error = "error"): Response {
  return new Response(JSON.stringify({ error, message: `Error ${status}` }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("server-api", () => {
  describe("fetchServerMutes", () => {
    it("returns parsed muted accounts", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse([
        { id: "1", acct: "user1@instance.tld", username: "user1", display_name: "User One" },
        { id: "2", acct: "user2@other.tld" }
      ]));

      const result = await fetchServerMutes({ fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/mutes",
        expect.objectContaining({ method: "GET" })
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "1",
        acct: "user1@instance.tld",
        username: "user1",
        display_name: "User One",
        url: undefined
      });
    });

    it("returns empty array for non-array response", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ error: "not found" }));
      const result = await fetchServerMutes({ fetchImpl });
      expect(result).toEqual([]);
    });

    it("filters out entries without id or acct", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse([
        { id: "1", acct: "valid@tld" },
        { id: "", acct: "no-id@tld" },
        { id: "3", acct: "" }
      ]));
      const result = await fetchServerMutes({ fetchImpl });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("throws ModerationServerApiError on HTTP error", async () => {
      const fetchImpl = vi.fn(async () => errorResponse(401));
      await expect(fetchServerMutes({ fetchImpl })).rejects.toThrow(ModerationServerApiError);
    });
  });

  describe("fetchServerBlocks", () => {
    it("returns parsed blocked accounts", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse([
        { id: "10", acct: "blocked@instance.tld" }
      ]));

      const result = await fetchServerBlocks({ fetchImpl });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("10");
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/blocks",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("fetchServerDomainBlocks", () => {
    it("returns domain strings", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(["spam.tld", "evil.instance"]));

      const result = await fetchServerDomainBlocks({ fetchImpl });
      expect(result).toEqual(["spam.tld", "evil.instance"]);
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/domain_blocks",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("filters non-string entries", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(["valid.tld", "", null, 123]));
      const result = await fetchServerDomainBlocks({ fetchImpl });
      expect(result).toEqual(["valid.tld"]);
    });
  });

  describe("serverMuteAccount", () => {
    it("posts mute with body params", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ id: "1" }));
      await serverMuteAccount("123", { notifications: true, duration: 3600 }, { fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/accounts/123/mute",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ notifications: true, duration: 3600 })
        })
      );
    });

    it("rejects invalid account IDs", async () => {
      const fetchImpl = vi.fn();
      await expect(serverMuteAccount("../../../etc", {}, { fetchImpl }))
        .rejects.toThrow("Invalid account ID");
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("serverUnmuteAccount", () => {
    it("posts unmute", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ id: "1" }));
      await serverUnmuteAccount("456", { fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/accounts/456/unmute",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("serverBlockAccount", () => {
    it("posts block", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ id: "1" }));
      await serverBlockAccount("789", { fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/accounts/789/block",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("serverUnblockAccount", () => {
    it("posts unblock", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ id: "1" }));
      await serverUnblockAccount("789", { fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/accounts/789/unblock",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("serverBlockDomain", () => {
    it("posts domain block", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({}));
      await serverBlockDomain("spam.tld", { fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/domain_blocks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ domain: "spam.tld" })
        })
      );
    });

    it("normalizes domain to lowercase", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({}));
      await serverBlockDomain("  SPAM.TLD  ", { fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/domain_blocks",
        expect.objectContaining({
          body: JSON.stringify({ domain: "spam.tld" })
        })
      );
    });

    it("rejects empty domain", async () => {
      const fetchImpl = vi.fn();
      await expect(serverBlockDomain("  ", { fetchImpl })).rejects.toThrow("Domain cannot be empty");
    });
  });

  describe("serverUnblockDomain", () => {
    it("deletes domain block", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({}));
      await serverUnblockDomain("spam.tld", { fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/auth/mastodon/domain_blocks",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ domain: "spam.tld" })
        })
      );
    });
  });

  describe("error handling", () => {
    it("wraps network errors as status 0", async () => {
      const fetchImpl = vi.fn(async () => { throw new TypeError("Failed to fetch"); });

      try {
        await fetchServerMutes({ fetchImpl });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ModerationServerApiError);
        expect((error as ModerationServerApiError).status).toBe(0);
        expect((error as ModerationServerApiError).isNetworkError).toBe(true);
      }
    });

    it("identifies auth errors", async () => {
      const fetchImpl = vi.fn(async () => errorResponse(403));

      try {
        await fetchServerMutes({ fetchImpl });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ModerationServerApiError);
        expect((error as ModerationServerApiError).isAuthError).toBe(true);
      }
    });
  });
});
