import {
  mastodonErrorResponseSchema,
  mastodonExchangeRequestSchema,
  mastodonExchangeResponseSchema,
  mastodonRegisterRequestSchema,
  mastodonRegisterResponseSchema
} from "../src/auth/contracts";

function assertThrows(fn: () => void, label: string): void {
  try {
    fn();
    throw new Error(`Expected validation failure for: ${label}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected validation failure")) {
      throw error;
    }
  }
}

function run(): void {
  const registerReq = {
    instanceOrigin: "https://mastodon.social",
    redirectUris: ["https://ryu.app/callback"],
    scopes: ["profile"]
  };

  const registerRes = {
    clientId: "abc123",
    instanceOrigin: "https://mastodon.social",
    scopes: ["profile"]
  };

  const exchangeReq = {
    instanceOrigin: "https://mastodon.social",
    code: "code-value",
    codeVerifier: "A".repeat(64),
    redirectUri: "https://ryu.app/callback"
  };

  const exchangeRes = {
    connected: true as const,
    instanceOrigin: "https://mastodon.social",
    scope: "profile",
    tokenType: "Bearer",
    account: {
      id: "1234",
      username: "reader",
      acct: "reader@mastodon.social",
      url: "https://mastodon.social/@reader"
    },
    expiresAt: null
  };

  mastodonRegisterRequestSchema.parse(registerReq);
  mastodonRegisterResponseSchema.parse(registerRes);
  mastodonExchangeRequestSchema.parse(exchangeReq);
  mastodonExchangeResponseSchema.parse(exchangeRes);

  mastodonErrorResponseSchema.parse({ error: "invalid_scope" });

  assertThrows(() => {
    mastodonRegisterRequestSchema.parse({
      instanceOrigin: "http://example.com",
      redirectUris: ["http://example.com/callback"],
      scopes: []
    });
  }, "insecure register request");

  assertThrows(() => {
    mastodonExchangeRequestSchema.parse({
      instanceOrigin: "https://example.com",
      code: "",
      codeVerifier: "short",
      redirectUri: "https://example.com/callback"
    });
  }, "invalid exchange request");

  assertThrows(() => {
    mastodonExchangeResponseSchema.parse({
      connected: false,
      instanceOrigin: "https://example.com"
    });
  }, "invalid exchange response");

  console.log("Auth contract harness passed");
}

run();
