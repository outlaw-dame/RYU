import { createCodeChallengeS256, createRandomString } from "./pkce";
import type { PendingAuthTransaction } from "./types";

export type AuthorizeUrlInput = {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  authScope: string;
  state: string;
  codeChallenge: string;
  forceLogin?: boolean;
};

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.authScope);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (input.forceLogin) {
    url.searchParams.set("force_login", "true");
  }

  return url.toString();
}

export async function createPendingAuthTransaction(input: {
  instanceOrigin: string;
  requestedScopes: string[];
  redirectUri: string;
}): Promise<PendingAuthTransaction & { authScope: string; codeChallenge: string }> {
  const state = createRandomString(32);
  const codeVerifier = createRandomString(64);
  const codeChallenge = await createCodeChallengeS256(codeVerifier);

  return {
    instanceOrigin: input.instanceOrigin,
    state,
    codeVerifier,
    requestedScopes: input.requestedScopes,
    redirectUri: input.redirectUri,
    createdAt: Date.now(),
    authScope: input.requestedScopes.join(" "),
    codeChallenge
  };
}
