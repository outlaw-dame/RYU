export type OAuthGrantType = "authorization_code" | "client_credentials";

export type OAuthServerMetadata = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  app_registration_endpoint?: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
  grant_types_supported?: OAuthGrantType[];
};

export type MastodonAuthEndpoints = {
  authorization: string;
  token: string;
  appRegistration: string;
  revocation: string;
  userInfo: string;
};

export type MastodonScopeDecision = {
  requestedScopes: string[];
  authScope: string;
  profileScopeSupported: boolean;
};

export type MastodonDiscoveryResult = {
  instanceOrigin: string;
  endpoints: MastodonAuthEndpoints;
  metadata: OAuthServerMetadata | null;
  discovered: boolean;
  scopeDecision: MastodonScopeDecision;
  supportsPkceS256: boolean;
  fallbackReason?: string;
};

export type PendingAuthTransaction = {
  instanceOrigin: string;
  state: string;
  codeVerifier: string;
  requestedScopes: string[];
  redirectUri: string;
  createdAt: number;
};
