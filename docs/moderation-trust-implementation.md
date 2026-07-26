# Moderation & Trust Controls — Implementation Status

> Last updated: 2026-07-26 (PR #148 merged)

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

### Phase 4: Recommendation Signal Schema (PR #148)

- `src/recommendations/signal-types.ts` — 11 entity types, 7 signal kinds, 3 provenances
- `src/recommendations/signal-store.ts` — Full CRUD with validation, capacity limit (2000), expiry
- `src/hooks/useRecommendationSignals.ts` — React hook with cross-tab sync
- `src/recommendations/signal-store.test.ts` — 23 behavioral tests
- Key invariant: explicit signals ALWAYS override inferred (provenance priority)

---

## Phase 5: Signal Integration + Explanation + UI ✅ COMPLETE (PR #150)

### Phase 6: Policy Surface Wiring ✅ COMPLETE (commit 189d023)
- Created usePolicySurface hook mapping useModeration → PolicyStoreState
- ActivityPage filters timeline + notifications through policy engine
- Blocked/muted/domain-blocked/keyword-filtered content now hidden
- Closes Codex P1 from PR #102

### Item 1: Wire signals into discovery recommendation engines

**Goal**: The discovery engines (`src/discovery/`) should consult active signals before/during scoring so that "show_more", "show_less", "suppress", etc. actually affect what users see.

**Files to modify:**

- `src/discovery/related-books.ts` — check `isEntitySuppressed()` before including results
- `src/discovery/reading-history-engine.ts` — boost/penalize based on active signals for authors
- `src/discovery/similar-authors.ts` — exclude suppressed authors, boost preferred
- `src/hooks/useDiscovery.ts` — filter final results through signal suppression

**Integration pattern:**

```typescript
import {
  isEntitySuppressed,
  getEffectiveSignal,
} from "../recommendations/signal-store";
import {
  isReviewerExcluded,
  computeReviewerTrustContribution,
} from "../recommendations/reviewer-trust-store";

// In scoring:
if (isEntitySuppressed("author", authorId)) continue; // Hard exclusion
const signal = getEffectiveSignal("author", authorId, "show_more");
if (signal) score += signal.strength * 0.2; // Bounded boost
```

**Tests to add**: Prove that suppressed entities never appear in results, that show_more boosts ranking, that show_less reduces ranking.

---

### Item 2: Build "Why this?" explanation trace

**Goal**: Every recommendation should carry a trace of which signals contributed to its score, so the "Why this?" UI can show users exactly what influenced the result.

**New file**: `src/recommendations/explanation-trace.ts`

**Shape:**

```typescript
export interface ExplanationTrace {
  finalScore: number;
  contributions: ExplanationContribution[];
  userEditableSignals: {
    signalId: string;
    kind: SignalKind;
    entityType: SignalEntityType;
    entityId: string;
  }[];
}

export interface ExplanationContribution {
  kind: string; // "content_similarity" | "reading_history" | "reviewer_trust" | "user_signal" | "suppression"
  delta: number;
  label: string; // Human-readable: "Because you read Dune" / "Trusted reviewer boost"
  signalId?: string; // If from a user signal, link to it for editing
}
```

**Integration**: The discovery engines produce this trace alongside each recommendation. The existing `Recommendation` type in `src/discovery/types.ts` should get an optional `scoreTrace?: ExplanationTrace` field.

---

### Item 3: Recommendation card control sheet UI

**Goal**: Replace the simple "dismiss ×" button on recommendation cards with a control menu.

**New component**: `src/components/discovery/RecommendationControlSheet.tsx`

**Actions:**

- Show more like this → `addSignal({ entityType, entityId, kind: "show_more" })`
- Show less like this → `addSignal({ entityType, entityId, kind: "show_less" })`
- Not interested → `addSignal({ entityType, entityId, kind: "not_interested" })`
- Hide this author → `addSignal({ entityType: "author", entityId: authorId, kind: "suppress" })`
- Don't use this reviewer → `setReviewerTrust(reviewerId, "low_trust")`
- Why am I seeing this? → open explanation panel showing `scoreTrace`

**Insertion point**: `src/components/discovery/RecommendationCard.tsx` already has a dismiss action — extend it with a menu trigger.

---

### Item 4: Unified scoring pipeline

**Goal**: Compose reviewer trust + recommendation signals + content similarity into one deterministic scoring function.

**New file**: `src/recommendations/unified-scorer.ts`

**Pipeline:**

```
baseScore (content similarity / reading history)
  + signal boost (show_more/prefer: +strength * 0.2)
  - signal penalty (show_less: -strength * 0.15)
  + reviewer trust contribution (bounded ±0.25)
  → hard exclusion check (suppress/not_interested/muted reviewer)
  → final score (clamped to [0, 1])
```

**Tests**: Deterministic — given the same inputs, always produces the same output. Signal > inference. Bounded effects. Exclusions are absolute.

---

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

### Test count: 1153 (as of PR #148)

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
