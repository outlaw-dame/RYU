import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverMastodonOAuth } from "./instance";

const granularReadScopes = ["read:statuses", "read:notifications", "read:accounts"];

describe("discoverMastodonOAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests granular read scopes when the server supports them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      scopes_supported: [...granularReadScopes, "profile"]
    })));

    const result = await discoverMastodonOAuth("https://books.example");

    expect(result.scopeDecision.requestedScopes).toEqual(granularReadScopes);
    expect(result.scopeDecision.authScope).toBe("read:statuses read:notifications read:accounts");
  });

  it("falls back to broad read when granular scopes are not advertised", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      scopes_supported: ["read", "write", "follow"]
    })));

    const result = await discoverMastodonOAuth("books.example");

    expect(result.scopeDecision.requestedScopes).toEqual(["read"]);
    expect(result.scopeDecision.authScope).toBe("read");
  });

  it("uses granular read scopes when metadata is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));

    const result = await discoverMastodonOAuth("books.example");

    expect(result.discovered).toBe(false);
    expect(result.scopeDecision.requestedScopes).toEqual(granularReadScopes);
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
