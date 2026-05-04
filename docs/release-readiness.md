# Release Readiness — RC1

## Scope

This report tracks hardening, integration, and quality gates for the Mastodon OAuth integration (Phases 1–4) plus the five RC1 features: scope upgrades, write/bookmark flows, bi-directional shelf sync, performance hardening, and documentation.

## Completed phases

### Phase 1 — Instance discovery, PKCE, state handling

- `decideScopes(metadata)` returns granular or broad scopes based on server capabilities.
- PKCE verifier and state generated client-side; stored in `localStorage` via `setPendingAuthTransaction`.
- OAuth state validated on callback; stale transactions cleared on success.

### Phase 2 — Backend session management

- `server/mastodon-auth-middleware.ts`: AES-256-GCM session cookies (`ryu_masto_session`), subkey derivation for credentials vs. session data.
- Routes: `POST /register`, `POST /exchange`, `POST /revoke`, `GET /session`.
- Write endpoints: `POST /statuses`, `DELETE /statuses/:id`, `POST /statuses/:id/favourite|unfavourite|bookmark|unbookmark`.
- CSRF guard (Origin vs Host), SSRF guard (private IP blocking), rate limiter (`allowWriteRequest`: 20/min).

### Phase 3 — Rich account profiles, Switch Account / Sign Out UX

- Session endpoint returns `{ connected, instanceOrigin, account, scope }`.
- `connectedAccount` state stores `grantedScopes` (parsed from space-separated scope string).
- Profile tab shows avatar, display name, `@acct`, instance, Switch Account, and Sign Out.

### Phase 4 — OAuth test suite

- 15+ tests in `src/auth/instance.test.ts` covering scope decision logic and error mapping.
- `npm run auth:errors` eval script validates error response mapping end-to-end.

## RC1 features

### Feature 1 — Scope upgrades on demand

- `hasWriteScope(grantedScopes, needed)` helper checks if granted scopes cover a specific write permission.
- Activity tab shows "Enable posting" upgrade prompt when `write:statuses` is absent; shows compose entry point when the scope is present.
- Upgrade path: sign out and reconnect — the default scope set already includes all write scopes for capable instances.

### Feature 2 — Write/bookmark flows wired in UI

- `ComposeSheet` component (textarea, visibility selector, hashtag chips, 500-char counter) is now rendered from the Activity tab.
- `ActivityStatusRow` accepts `actions?: StatusAction[]` — rendered as inline buttons with per-row pending state.
- Activity tab timeline rows pass Bookmark/Favourite actions when the corresponding write scopes are granted.
- `apiFavouriteStatus`, `apiUnfavouriteStatus`, `apiBookmarkStatus`, `apiUnbookmarkStatus` fully wired in UI.

### Feature 3 — Shelf sync bi-directional

- `useMastodonShelves` now exposes `addBookmark`, `removeBookmark`, `addFavourite`, `removeFavourite` for optimistic local updates.
- Bookmarking a timeline post adds it to local shelves immediately; unbookmarking removes it.
- Shelves tab "Remove bookmark" and "Unfavourite" actions call the API and remove items from local state optimistically.
- Server-side shelf cache (`SHELVES_CACHE_TTL_MS = 5 min`) is invalidated on every bookmark/unbookmark.

### Feature 4 — Performance hardening

- Client-side discovery search cache: 3-minute TTL (`Map<string, {data, ts}>`), checked before every API call.
- In-flight deduplication: concurrent requests for the same query share a single `Promise`, preventing duplicate fetches.
- Entity enrichment scheduler already coalesces by `jobKey`; `DEFAULT_CONCURRENCY = 1` remains conservative.

## Hardening (prior)

- OAuth client-side register and exchange: bounded timeout + exponential backoff with jitter.
- OAuth callback self-heals by clearing query params and pending transaction state after successful exchange.
- Instance discovery and picker validated via browser E2E with controlled network fixtures.

## Dependency security status

- `npm audit --json` previously reported moderate advisories via `rxdb -> ajv`; package override applied for patched versions.
- Review on each lock-file change; accept as temporary risk if migration cost outweighs impact.

## RC1 gate checklist

Run in order before tagging RC1:

1. `git fetch --all --prune`
2. `git rev-list --left-right --count HEAD...@{u}` — verify clean with upstream
3. `npm ci`
4. `npm run typecheck` — must exit 0
5. `npm run auth:contracts` — contract harness
6. `npm run auth:smoke` — backend smoke test
7. `npm run auth:errors` — error mapping eval (Phase 4)
8. `npm run search:eval` — search quality baseline
9. `npm run test` — all unit tests
10. `npm run test:e2e` — browser E2E
11. `npm run build` — production build must succeed

## Manual verification checklist

- [ ] Connect a Mastodon account → profile tab shows avatar, acct, instance
- [ ] Verify `scope` is stored: check network response from `/api/auth/mastodon/session` includes `scope`
- [ ] Compose sheet opens from Activity tab when `write:statuses` scope is present
- [ ] Post a status via Compose sheet → post appears at top of Home Timeline
- [ ] Bookmark a timeline post → status appears in Shelves › Bookmarks immediately (optimistic)
- [ ] Favourite a timeline post → status appears in Shelves › Favourites immediately (optimistic)
- [ ] Remove bookmark from Shelves tab → row removed immediately (optimistic)
- [ ] Unfavourite from Shelves tab → row removed immediately (optimistic)
- [ ] Search the discovery feed twice with the same query → second request served from cache (check DevTools — no duplicate network request within 3 minutes)
- [ ] Connect with a limited-scope session (profile-only) → "Enable posting" banner shown instead of compose entry point
- [ ] Sign out → shelves cleared, activity cleared, profile tab shows sign-in form
