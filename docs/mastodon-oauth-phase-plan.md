# Mastodon OAuth Implementation Plan

This document captures the implementation sequence for Mastodon OAuth in Ryu.

## Security constraints

- Mastodon currently provisions confidential clients.
- client_secret must never be embedded in frontend code.
- Authorization Code flow must use state validation and PKCE S256.
- Token exchange and revocation must run on backend endpoints.

## Phase 1 (implemented in this branch)

- Add instance normalization and OAuth metadata discovery with 404 fallback.
- Add scope decision logic with profile scope preference and read:accounts fallback.
- Add PKCE code verifier/challenge generation utilities.
- Add pending auth transaction storage in session storage with expiry.
- Add profile UI to start login and process callback state checks.
- Add backend endpoint wiring for app registration and code exchange.

## Instance Discovery Policy (implemented)

- Merge BookWyrm instance data and FediDB server data into a unified picker.
- Keep only Mastodon API compatible software families for OAuth signup flows.
- For signup flows, only show instances with open registration.
- Filter out domains present in Oliphant Tier 0 unified blocklist.
- Use manual instance entry as fallback when discovery sources are temporarily unavailable.

## Phase 2

- Implement backend endpoint: POST /api/auth/mastodon/register
  - Request body: instanceOrigin, redirectUris, scopes
  - Action: call POST /api/v1/apps on the selected instance
  - Store client_id and client_secret securely
  - Return: clientId
- Implement backend endpoint: POST /api/auth/mastodon/exchange
  - Request body: instanceOrigin, code, codeVerifier, redirectUri
  - Action: call POST /oauth/token using confidential credentials
  - Return a secure app session (prefer HttpOnly cookie)
- Implement backend endpoint: POST /api/auth/mastodon/revoke
  - Revoke tokens on logout and clear session

## Phase 3

- Persist connected account details from verify_credentials.
- Add account switch and logout UX.
- Add scope upgrades only when user enables features requiring them.

## Phase 4

- Add test coverage:
  - state mismatch and replay rejection
  - PKCE format and challenge correctness
  - discovery fallback behavior
  - backend error mapping for invalid_scope, invalid_client, invalid_grant
