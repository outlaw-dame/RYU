# ADR-001: Local-First Hybrid Search Engine Architecture

## Status

**Accepted** — June 2026

## Context

RYU is a local-first book-social reading app. Search must work offline, respect privacy, and operate entirely within the browser/PWA boundary without mandatory server dependencies.

The search subsystem was hardened across Phases 1-8, formalizing:
- A stable `LocalHybridSearchEngine` interface
- RxDB + Orama + local embeddings as the implementation
- Progressive search, scope/provenance filtering, and entity coverage

A decision is needed on whether to adopt PGlite/pgvector as an alternative or replacement engine.

## Decision

**RxDB + Orama + local embeddings remains the default and only production search engine.**

PGlite/pgvector is NOT adopted at this time. It may be evaluated later as an experimental sidecar for specific use cases (filtered semantic search at scale, pgvector parity with a server search layer).

### Architecture

```
┌──────────────────────────────────────────────────┐
│ App Layer (React hooks, UI)                       │
│   useSearch() / useProgressiveSearch()            │
├──────────────────────────────────────────────────┤
│ SearchProvider (context + hook boundary)           │
├──────────────────────────────────────────────────┤
│ LocalHybridSearchEngine interface                 │
│   search() / searchProgressively()                │
│   indexDocument() / removeDocument()              │
│   inspectHealth() / repair() / rebuild()          │
├──────────────────────────────────────────────────┤
│ RxDbOramaHybridSearchEngine (default adapter)     │
│   ┌─────────────┐  ┌──────────────────────────┐ │
│   │ Orama       │  │ Vector Index             │ │
│   │ (lexical)   │  │ (semantic, in-memory)    │ │
│   └─────────────┘  └──────────────────────────┘ │
│   ┌─────────────────────────────────────────────┐│
│   │ RxDB (canonical data + persisted vectors)   ││
│   │   Dexie storage / IndexedDB                 ││
│   └─────────────────────────────────────────────┘│
├──────────────────────────────────────────────────┤
│ Embedding Job Scheduler (priority queue, backoff) │
│ Provider: deterministic (default) / MiniLM / Gemma│
└──────────────────────────────────────────────────┘
```

### Rules

1. **Canonical data lives in RxDB** — unless explicitly changed by a future ADR.
2. **The default engine is `RxDbOramaHybridSearchEngine`** — all app code depends on the `LocalHybridSearchEngine` interface, never on Orama/vector-index directly.
3. **No second search stack** — there is exactly one active engine at any time.
4. **Experimental engines** (e.g., PGlite) must implement `LocalHybridSearchEngine` and be gated behind a feature flag. They MUST NOT modify canonical RxDB data or schema.
5. **Deterministic embeddings are always available** — enhanced providers (MiniLM, EmbeddingGemma) are optional upgrades that degrade gracefully.
6. **Privacy enforcement happens at the engine boundary** — `filterResultsByScope` runs on every search path (standard and progressive).

### Feature Flag Plan

```typescript
// Future experimental engine activation (NOT implemented yet)
type SearchEngineFlag = "rxdb-orama" | "pglite-experimental";

// Default: always rxdb-orama
// Future: const activeEngine: SearchEngineFlag = (getSearchRuntimeSettings() as any).experimentalEngine ?? "rxdb-orama";
```

When/if PGlite is evaluated:
- It runs as a **sidecar** — reads from RxDB, does NOT own canonical data
- It implements `LocalHybridSearchEngine` interface
- It is activated via a user-facing "Experimental search" toggle
- If it fails, the app falls back to `rxdb-orama` silently
- It cannot be enabled without user consent

### Fallback Strategy

```
If experimental engine fails:
  1. Log error with diagnostics
  2. Clear experimental engine flag
  3. Fall back to RxDbOramaHybridSearchEngine
  4. Notify user: "Enhanced search unavailable, using standard search"
  5. Do NOT retry until user re-enables
```

### Search Engine Compatibility Contract

Any `LocalHybridSearchEngine` implementation MUST:
- Accept `HybridSearchQuery` and return `HybridSearchResponse`
- Include `HybridSearchDiagnostics` with every response
- Support `searchProgressively()` with stage updates
- Respect `SearchDocumentScope` and `currentUserId` for privacy
- Handle `indexDocument` / `removeDocument` idempotently
- Support `inspectHealth` / `repair` / `rebuild` lifecycle
- Never block the main thread for >50ms on any single call
- Degrade gracefully when semantic embeddings are unavailable

## Consequences

- Future agents will NOT introduce PGlite, pgvector, or any alternative search engine without a new ADR.
- The `LocalHybridSearchEngine` interface is the stable contract for all search consumers.
- RxDB remains the canonical persistence layer.
- Orama remains the lexical search engine.
- The in-memory vector map + persisted vectors in RxDB remain the semantic search engine.
- Enhanced embedding providers are optional and user-controlled.

## References

- PR #52: Hybrid engine boundary
- PR #53: Vector lifecycle hardening
- PR #54: Embedding job scheduler
- PR #55: Progressive search API
- PR #56: Update/delete lifecycle
- PR #57: Warmup hydration fix
- PR #58-60: Scheduler integration
- PR #61: Scope/provenance
- PR #62: Entity coverage (reviews)
- PR #63: Search quality evaluation
- PR #64: Security audit fixes
