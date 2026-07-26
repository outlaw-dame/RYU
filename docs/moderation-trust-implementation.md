# Moderation & Trust Controls — Implementation Status

> Last updated: 2026-07-26 (PR #146 merged)

## Completed Phases

### Phase 1: Reconcile Moderation Stack (PR #141)

- Ported ~4,900 lines from stacked PRs #108-#111 onto main
- Policy engine, trust controls, spoiler engine, semantic filters, notification filter, search moderation filter, relationship hydration, report flow
- Closed superseded PRs #105, #107, #108, #109, #110, #111

### Phase 2a: RxDB Collection Registration (PR #143)

- 3 consolidated collections: `moderationpolicies`, `moderationrelationships`, `moderationsyncstate`
- Stays within RxDB open-source 16-collection limit (11 core + 3 = 14)
- Graceful fallback if registration fails
- Idempotent localStorage→RxDB migration module with 11 behavioral tests
- Owner-scoped documents (IDOR protection by construction)

### Phase 2b: App Startup Wiring + Dual-Write (PR #145)

- `useModerationMigration` hook triggers migration on session load
- `useModeration` dual-writes to both localStorage AND RxDB on every mutation
- Reads remain from localStorage (synchronous, reliable)
- RxDB writes are fire-and-forget (async, never block UI)

### Phase 3: User-Controlled Reviewer Trust (PR #146)

- `src/recommendations/reviewer-trust-store.ts` — Store + bounded scoring
- `src/hooks/useReviewerTrust.ts` — React hook with cross-tab sync
- Trust levels: trusted (+0.15–0.25), neutral (0), low_trust (-0.10–-0.15), muted (excluded), blocked (excluded)
- 23 behavioral tests covering scoring bounds, confidence scaling, exclusion, persistence
- System NEVER auto-assigns trust — explicit user action only

## Step 4 — Recommendation Signal Schema ✅ COMPLETE — Recommendation Signal Schema

### What this phase must deliver:

1. **RecommendationSignal type** — the canonical schema for user preference signals
2. **Signal store module** — CRUD operations for signals (localStorage + RxDB dual-write ready)
3. **Signal types**: show_more, show_less, not_interested, suppress, prefer, trusted, low_trust
4. **Entity types covered**: author, work, edition, series, publisher, genre, tag, trope, account, domain, source
5. **Provenance tracking**: user_explicit vs local_inference vs imported
6. **Strength/confidence**: numeric weight for how strongly the signal applies
7. **Expiry support**: optional TTL for time-limited signals
8. **React hook** with reactive state and cross-tab sync
9. **Integration point** with the discovery recommendation engine
10. **Tests** — behavioral tests for CRUD, provenance, expiry, entity scoping

### Key invariants:

- Explicit user signals ALWAYS override inferred signals
- Inferred signals can be deleted without affecting explicit ones
- Each signal is scoped to an entity (author/work/etc) + an entity ID
- Expired signals stop applying but aren't deleted (audit trail)
- Reset clears only inferred signals by default; explicit requires confirmation

### Files to create:

- `src/recommendations/signal-types.ts` — Type definitions
- `src/recommendations/signal-store.ts` — CRUD + query operations
- `src/recommendations/signal-store.test.ts` — Tests
- `src/hooks/useRecommendationSignals.ts` — React hook

### Integration with existing code:

- `src/discovery/` engines should consult signals before scoring
- `src/recommendations/reviewer-trust-store.ts` should compose with signals
- The discovery `useDiscovery` hook should filter based on active signals

## Architecture Notes

### Storage hierarchy:

```
localStorage (synchronous, immediate, always works)
  ↓ dual-write (async, fire-and-forget)
RxDB moderationpolicies collection (durable, cross-tab, queryable)
```

### Collection count (14/16 limit):

- 11 core: authors, works, editions, reviews, entityresolutions, entitylinks, bookwyrminstances, searchvectors, searchindexdependencies, fetchqueue, writequeue
- 3 moderation: moderationpolicies, moderationrelationships, moderationsyncstate

### Owner isolation:

Every moderation/trust document includes `ownerAccountId`. Queries MUST filter by owner. Document IDs include the owner to prevent collisions: `local:{type}:{owner}:{targetId}`.
