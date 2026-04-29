# Mastodon Auth Backend Notes

## What is implemented

- Dev middleware backend mounted in Vite for:
  - POST /api/auth/mastodon/register
  - POST /api/auth/mastodon/exchange
  - POST /api/auth/mastodon/revoke
- Standalone API scaffold using same handlers:
  - `npm run auth:server`
- End-to-end backend smoke test against a local mock Mastodon server:
  - `npm run auth:smoke`
- Strict schema validation using shared contracts from src/auth/contracts.ts.
- Encrypted credential storage at .data/mastodon-credentials.enc using AES-256-GCM.
- Request safeguards:
  - method checks
  - request size limits
  - same-origin check for Origin header
  - basic rate limiting by client IP
- Upstream resilience:
  - timeout and retry with exponential backoff + jitter for transient failures.
- Privacy and security defaults:
  - no token logging
  - HttpOnly session cookie
  - SameSite=Lax
  - Secure flag when TLS is detected

## Production guidance

The Vite middleware is suitable for development and controlled deployments.
For production, move the same handler logic into a dedicated API service and back credentials by a managed secret store (KMS/Key Vault/Secrets Manager).

## Required environment variable

- MASTODON_CLIENT_STORE_KEY
  - Strong random secret used to derive encryption key material.
  - If missing, middleware falls back to an ephemeral random secret for local development only.

## Validation checklist

Run these checks after auth or discovery changes:

- `npm run typecheck`
- `npm run auth:contracts`
- `npm run auth:smoke`
- `npm run search:eval`
- `npm run test`

Hardening checks to explicitly verify:

- rate-limiting still applies by client IP and does not block legitimate callback flow
- upstream timeout and retry behavior still uses exponential backoff with jitter
- discovery cache refresh still updates stale data without duplicate merge artifacts
