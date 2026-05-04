import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverMastodonOAuth } from "./instance";

const granularScopes = [
  "read:statuses", "read:notifications", "read:accounts",
  "write:statuses", "write:favourites", "write:bookmarks"
];

describe("discoverMastodonOAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests all granular read+write scopes when the server supports them", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      scopes_supported: [...granularScopes, "profile"]
    }));

    const result = await discoverMastodonOAuth("https://books.example");

    expect(result.scopeDecision.requestedScopes).toEqual(granularScopes);
    expect(result.scopeDecision.authScope).toBe(granularScopes.join(" "));
  });

  it("falls back to broad read+write when granular scopes are not advertised", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      scopes_supported: ["read", "write", "follow"]
    }));

    const result = await discoverMastodonOAuth("books.example");

    expect(result.scopeDecision.requestedScopes).toEqual(["read", "write"]);
    expect(result.scopeDecision.authScope).toBe("read write");
  });

  it("uses granular read+write scopes when metadata is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not found", { status: 404 }));

    const result = await discoverMastodonOAuth("books.example");

    expect(result.discovered).toBe(false);
    expect(result.scopeDecision.requestedScopes).toEqual(granularScopes);
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
