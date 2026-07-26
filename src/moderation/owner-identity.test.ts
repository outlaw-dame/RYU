import { describe, expect, it } from "vitest";
import { buildModerationOwnerIdentity } from "./owner-identity";

describe("buildModerationOwnerIdentity", () => {
  it("scopes the same local account id by normalized instance origin", () => {
    const account = { id: "42", acct: "alice" };
    expect(buildModerationOwnerIdentity({
      connected: true,
      instanceOrigin: "https://BOOKS-A.example/path",
      account
    })).toBe("https://books-a.example#42");
    expect(buildModerationOwnerIdentity({
      connected: true,
      instanceOrigin: "https://books-b.example",
      account
    })).toBe("https://books-b.example#42");
  });

  it("falls back to acct only when the server session omits account id", () => {
    expect(buildModerationOwnerIdentity({
      connected: true,
      instanceOrigin: "https://books.example",
      account: { acct: "alice@books.example" }
    })).toBe("https://books.example#alice@books.example");
  });

  it("fails closed for disconnected, malformed, or insecure remote sessions", () => {
    expect(buildModerationOwnerIdentity({ connected: false })).toBeNull();
    expect(buildModerationOwnerIdentity({
      connected: true,
      instanceOrigin: "not a url",
      account: { id: "1", acct: "alice" }
    })).toBeNull();
    expect(buildModerationOwnerIdentity({
      connected: true,
      instanceOrigin: "http://books.example",
      account: { id: "1", acct: "alice" }
    })).toBeNull();
  });
});
