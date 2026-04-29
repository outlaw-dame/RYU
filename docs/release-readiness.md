# Release Readiness Report

## Scope

This report summarizes hardening work completed for auth safety, discovery safety, browser E2E coverage, dependency review, and branch health.

## Hardening updates

- OAuth client-side register and exchange now use bounded timeout + exponential backoff with jitter for retryable failures.
- OAuth callback effect now guards state updates on teardown to prevent stale state writes.
- OAuth callback flow self-heals by clearing callback query params and pending transaction state after a successful exchange.
- Instance discovery and picker behavior is validated via browser E2E using controlled network fixtures.

## Browser E2E coverage

- `tests/e2e/auth-discovery.spec.ts`
- Coverage includes:
  - picker flow with Tier 0 exclusion verification
  - OAuth callback retry path (`503 -> 503 -> 200`) and transaction cleanup verification

## Dependency security status

- `npm audit --json` previously reported moderate advisories via `rxdb -> ajv`.
- A package override is now in place for `ajv` to force patched versions when compatible.
- If advisories remain in future lock states and cannot be safely patched without a major dependency migration, track as an accepted temporary risk with explicit migration plan.

## Branch health gates

Run before PR/merge:

1. `git fetch --all --prune`
2. `git rev-list --left-right --count HEAD...@{u}`
3. `npm ci`
4. `npm run typecheck`
5. `npm run auth:contracts`
6. `npm run auth:smoke`
7. `npm run search:eval`
8. `npm run test`
9. `npm run test:e2e`
10. `npm run build`
