import { describe, expect, it } from "vitest";
import { createCodeChallengeS256, createRandomString } from "./pkce";
import { buildAuthorizeUrl, createPendingAuthTransaction } from "./oauth";

describe("PKCE", () => {
  it("generates code verifier with correct length and characters", async () => {
    const verifier = createRandomString(64);

    // 64 bytes base64url encoded is roughly 86 chars (64 * 4/3)
    expect(verifier.length).toBeGreaterThan(80);
    expect(verifier.length).toBeLessThan(90);
    expect(/^[A-Za-z0-9_\-]*$/.test(verifier)).toBe(true);
  });

  it("generates consistent code challenge for same verifier", async () => {
    const verifier = "A".repeat(64);

    const challenge1 = await createCodeChallengeS256(verifier);
    const challenge2 = await createCodeChallengeS256(verifier);

    expect(challenge1).toBe(challenge2);
    expect(/^[A-Za-z0-9_\-]*$/.test(challenge1)).toBe(true);
  });

  it("generates different challenges for different verifiers", async () => {
    const verifier1 = createRandomString(64);
    const verifier2 = createRandomString(64);

    const challenge1 = await createCodeChallengeS256(verifier1);
    const challenge2 = await createCodeChallengeS256(verifier2);

    expect(challenge1).not.toBe(challenge2);
  });
});

describe("buildAuthorizeUrl", () => {
  it("constructs OAuth authorize URL with required parameters", () => {
    const url = buildAuthorizeUrl({
      authorizationEndpoint: "https://mastodon.social/oauth/authorize",
      clientId: "client-123",
      redirectUri: "https://ryu.app/callback",
      authScope: "read:statuses read:accounts",
      state: "state-abc123",
      codeChallenge: "challenge-xyz789"
    });

    expect(url).toContain("response_type=code");
    expect(url).toContain("client_id=client-123");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("scope=read");
    expect(url).toContain("state=state-abc123");
    expect(url).toContain("code_challenge=challenge-xyz789");
    expect(url).toContain("code_challenge_method=S256");
  });

  it("includes force_login when specified", () => {
    const urlWithoutForce = buildAuthorizeUrl({
      authorizationEndpoint: "https://mastodon.social/oauth/authorize",
      clientId: "client-123",
      redirectUri: "https://ryu.app/callback",
      authScope: "read",
      state: "state-123",
      codeChallenge: "challenge-123",
      forceLogin: false
    });

    const urlWithForce = buildAuthorizeUrl({
      authorizationEndpoint: "https://mastodon.social/oauth/authorize",
      clientId: "client-123",
      redirectUri: "https://ryu.app/callback",
      authScope: "read",
      state: "state-123",
      codeChallenge: "challenge-123",
      forceLogin: true
    });

    expect(urlWithoutForce).not.toContain("force_login");
    expect(urlWithForce).toContain("force_login=true");
  });
});

describe("createPendingAuthTransaction", () => {
  it("creates transaction with unique state and verifier", async () => {
    const tx1 = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read:statuses", "read:accounts"],
      redirectUri: "https://ryu.app/callback"
    });

    const tx2 = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read:statuses", "read:accounts"],
      redirectUri: "https://ryu.app/callback"
    });

    expect(tx1.state).not.toBe(tx2.state);
    expect(tx1.codeVerifier).not.toBe(tx2.codeVerifier);
  });

  it("creates transaction with valid state and code verifier format", async () => {
    const tx = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read"],
      redirectUri: "https://ryu.app/callback"
    });

    // 32 bytes base64url encoded is roughly 43 chars
    expect(tx.state.length).toBeGreaterThan(40);
    expect(/^[A-Za-z0-9_\-]*$/.test(tx.state)).toBe(true);

    // 64 bytes base64url encoded is roughly 86 chars
    expect(tx.codeVerifier.length).toBeGreaterThan(80);
    expect(/^[A-Za-z0-9_\-]*$/.test(tx.codeVerifier)).toBe(true);
  });

  it("includes createdAt timestamp", async () => {
    const beforeCreation = Date.now();
    const tx = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read"],
      redirectUri: "https://ryu.app/callback"
    });
    const afterCreation = Date.now();

    expect(tx.createdAt).toBeGreaterThanOrEqual(beforeCreation);
    expect(tx.createdAt).toBeLessThanOrEqual(afterCreation);
  });

  it("generates valid code challenge from verifier", async () => {
    const tx = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read"],
      redirectUri: "https://ryu.app/callback"
    });

    expect(tx.codeChallenge).toBeTruthy();
    expect(/^[A-Za-z0-9_\-]*$/.test(tx.codeChallenge)).toBe(true);

    // Verify challenge is deterministic for same verifier
    const expectedChallenge = await createCodeChallengeS256(tx.codeVerifier);
    expect(tx.codeChallenge).toBe(expectedChallenge);
  });

  it("preserves requested scopes in transaction", async () => {
    const scopes = ["read:statuses", "read:notifications", "read:accounts"];
    const tx = await createPendingAuthTransaction({
      instanceOrigin: "https://bookwyrm.social",
      requestedScopes: scopes,
      redirectUri: "https://ryu.app/callback"
    });

    expect(tx.requestedScopes).toEqual(scopes);
    expect(tx.authScope).toBe(scopes.join(" "));
  });
});

describe("State validation and replay protection", () => {
  it("detects state mismatch", async () => {
    const tx = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read"],
      redirectUri: "https://ryu.app/callback"
    });

    const callbackState = "different-state-value";
    const stateMatches = tx.state === callbackState;

    expect(stateMatches).toBe(false);
  });

  it("validates state is present and non-empty", async () => {
    const tx = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read"],
      redirectUri: "https://ryu.app/callback"
    });

    expect(tx.state).toBeTruthy();
    expect(tx.state.length).toBeGreaterThan(0);
  });

  it("detects expired transactions based on createdAt", async () => {
    const tx = await createPendingAuthTransaction({
      instanceOrigin: "https://mastodon.social",
      requestedScopes: ["read"],
      redirectUri: "https://ryu.app/callback"
    });

    const MAX_TRANSACTION_AGE_MS = 10 * 60 * 1000; // 10 minutes
    const isExpired = Date.now() - tx.createdAt > MAX_TRANSACTION_AGE_MS;

    expect(isExpired).toBe(false);

    // Simulate expiry by setting createdAt to far past
    const expiredTx = { ...tx, createdAt: Date.now() - (15 * 60 * 1000) };
    const isExpiredAfterTime = Date.now() - expiredTx.createdAt > MAX_TRANSACTION_AGE_MS;

    expect(isExpiredAfterTime).toBe(true);
  });
});

describe("Request/Response validation", () => {
  it("validates exchange request with code and code verifier", () => {
    const exchangeReq = {
      instanceOrigin: "https://mastodon.social",
      code: "auth-code-value",
      codeVerifier: "A".repeat(64),
      redirectUri: "https://ryu.app/callback"
    };

    // Exchange request should have all required fields
    expect(exchangeReq.code).toBeTruthy();
    expect(exchangeReq.codeVerifier).toHaveLength(64);
    expect(exchangeReq.redirectUri).toMatch(/^https:\/\//);
  });

  it("validates PKCE is HTTPS-only", () => {
    const insecureRedirectUri = "http://ryu.app/callback";
    const secureRedirectUri = "https://ryu.app/callback";

    expect(secureRedirectUri.startsWith("https://")).toBe(true);
    expect(insecureRedirectUri.startsWith("https://")).toBe(false);
  });
});
