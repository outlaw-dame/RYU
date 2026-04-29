import type { MastodonDiscoveryResult, OAuthServerMetadata } from "./types";

const DEFAULT_SCOPE_SET = ["profile"];
const FALLBACK_SCOPE_SET = ["read:accounts"];

function buildFallbackEndpoints(instanceOrigin: string) {
  return {
    authorization: `${instanceOrigin}/oauth/authorize`,
    token: `${instanceOrigin}/oauth/token`,
    appRegistration: `${instanceOrigin}/api/v1/apps`,
    revocation: `${instanceOrigin}/oauth/revoke`,
    userInfo: `${instanceOrigin}/oauth/userinfo`
  };
}

export function normalizeInstanceOrigin(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Instance is required");

  const hasProtocol = /^https?:\/\//i.test(trimmed);
  const parsed = new URL(hasProtocol ? trimmed : `https://${trimmed}`);

  if (!parsed.hostname) {
    throw new Error("Instance must include a valid hostname");
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Instance must use HTTPS (except localhost for development)");
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function decideScopes(metadata: OAuthServerMetadata | null) {
  const supported = new Set(metadata?.scopes_supported ?? []);
  const profileScopeSupported = supported.has("profile") || supported.size === 0;
  const requestedScopes = profileScopeSupported ? DEFAULT_SCOPE_SET : FALLBACK_SCOPE_SET;

  return {
    requestedScopes,
    authScope: requestedScopes.join(" "),
    profileScopeSupported
  };
}

export async function discoverMastodonOAuth(instanceInput: string): Promise<MastodonDiscoveryResult> {
  const instanceOrigin = normalizeInstanceOrigin(instanceInput);
  const fallback = buildFallbackEndpoints(instanceOrigin);

  try {
    const metadataUrl = `${instanceOrigin}/.well-known/oauth-authorization-server`;
    const response = await fetch(metadataUrl, {
      headers: { Accept: "application/json" }
    });

    if (response.status === 404) {
      return {
        instanceOrigin,
        endpoints: fallback,
        metadata: null,
        discovered: false,
        scopeDecision: decideScopes(null),
        supportsPkceS256: false,
        fallbackReason: "OAuth metadata endpoint not found (likely Mastodon < 4.3)."
      };
    }

    if (!response.ok) {
      return {
        instanceOrigin,
        endpoints: fallback,
        metadata: null,
        discovered: false,
        scopeDecision: decideScopes(null),
        supportsPkceS256: false,
        fallbackReason: `OAuth metadata request failed with status ${response.status}.`
      };
    }

    const metadata = (await response.json()) as OAuthServerMetadata;
    const endpoints = {
      authorization: metadata.authorization_endpoint ?? fallback.authorization,
      token: metadata.token_endpoint ?? fallback.token,
      appRegistration: metadata.app_registration_endpoint ?? fallback.appRegistration,
      revocation: metadata.revocation_endpoint ?? fallback.revocation,
      userInfo: metadata.userinfo_endpoint ?? fallback.userInfo
    };
    const supportsPkceS256 = (metadata.code_challenge_methods_supported ?? []).includes("S256");

    return {
      instanceOrigin,
      endpoints,
      metadata,
      discovered: true,
      scopeDecision: decideScopes(metadata),
      supportsPkceS256
    };
  } catch (error) {
    return {
      instanceOrigin,
      endpoints: fallback,
      metadata: null,
      discovered: false,
      scopeDecision: decideScopes(null),
      supportsPkceS256: false,
      fallbackReason: error instanceof Error ? error.message : "Unknown discovery error"
    };
  }
}
