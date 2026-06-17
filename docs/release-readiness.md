# Search Subsystem Release Readiness

## Overview

This document captures the release hardening decisions and operational checklist for the local-first hybrid search subsystem (Phases 10–22).

## Feature Flags

All search capabilities are gated behind runtime feature flags persisted in localStorage. Flags can be toggled without code changes or schema migrations. Flags are consulted at runtime by the search pipeline:
- `enhanced_search` gates `runtime-configure.ts` (forces deterministic when disabled)
- `personalization` gates `feedback-ranking.ts` (skips boost application when disabled)
- Other flags are ready for wiring as their subsystems are integrated into the shell

| Flag | Default | Description |
|------|---------|-------------|
| `enhanced_search` | `true` | MiniLM/EmbeddingGemma semantic embedding |
| `progressive_search` | `true` | Lexical-first then semantic-enhanced results |
| `federated_discovery` | `false` | Server-side search fallback (not yet implemented) |
| `personalization` | `true` | Local click/selection feedback ranking boosts |
| `debug_panel` | `false` | Search diagnostics panel in settings |
| `pwa_orchestration` | `true` | Background indexing lifecycle coordination |
| `remote_cache_eviction` | `true` | TTL-based remote cache vector cleanup |

## Migration Safety

- **Schema versioning**: RxDB handles collection-level migrations via `migrationStrategies`.
- **Search schema version**: tracked separately in localStorage (`ryu.search.schema-version.v1`).
- **Forward migration**: safe — vectors flagged for rebuild.
- **Downgrade**: safe — vectors rebuilt, canonical data preserved.
- **Enhanced search disable**: always safe — deterministic fallback works independently.
- **Corrupt vector recovery**: always safe — vectors are derived data and can be regenerated from canonical entities.

## Rollback Behavior

1. User reverts to an older app version.
2. `checkMigrationSafety()` detects the downgrade (persisted > current).
3. Vectors are flagged for rebuild (they may be incompatible).
4. Canonical entity data (authors, works, editions, reviews) is NEVER deleted during migration.
5. Lexical search (Orama) rebuilds from canonical data on startup.
6. Semantic search regenerates vectors via the health repair flow.

## Backup/Restore

- RxDB's Dexie storage persists to IndexedDB with `navigator.storage.persist()`.
- The "Delete local AI/search artifacts" control (Phase 14) removes ONLY derived data (vectors, model caches) — never canonical entities.
- A full database export can be done via RxDB's JSON export plugin (not yet wired to UI).

## IndexedDB Upgrade Safety

- All collections use `migrationStrategies: { 1: passThrough }` so version-1 data passes through unchanged.
- Future schema changes MUST add new migration strategies (never modify existing ones).
- The `search:eval` and `search:indexing-eval` CI scripts catch schema regressions.

## Troubleshooting

### Search returns no results
1. Check the debug panel (Settings > Search Diagnostics).
2. If "Healthy: No" — tap Refresh to trigger a health check, then wait for repair.
3. If "Missing vectors" is high — the embedding provider may have failed. Check "Last error".
4. Try disabling Enhanced Search (Settings > Search > Enhanced Search toggle OFF). Lexical search always works.

### Semantic search seems wrong/stale
1. The current embedding provider and generation are shown in the debug panel.
2. If provider recently changed — vectors are being rebuilt in the background.
3. You can force a full rebuild via "Delete local AI/search artifacts" then re-enable Enhanced Search.

### App is slow on startup
1. Background indexing is gated by the PWA orchestrator — it does not run until `document.readyState >= 'interactive'`.
2. On low-memory devices, the orchestrator automatically disables enhanced models.
3. If still slow, disable `pwa_orchestration` flag temporarily for diagnosis.

### Private content appearing in wrong places
1. This should never happen — the scope filter enforces tier visibility at every search path.
2. Run the privacy audit tests: `npm run test -- src/search/__tests__/privacy-audit.test.ts`
3. Check the diagnostics panel — if `lexicalCount` or `semanticCount` seem too high for a global query, file a bug.

## Release Checklist

- [ ] All CI passes (`npm run build` includes typecheck + vite build)
- [ ] `npm run search:quality-eval` passes (intent accuracy ≥50%, exact match ≥90%, privacy=0)
- [ ] `npm run search:import-eval` passes
- [ ] `npm run search:indexing-eval` passes
- [ ] `npm run search:health-eval` passes
- [ ] `npm run test:e2e` passes
- [ ] Feature flags set to production defaults
- [ ] `federated_discovery` remains `false` until Phase 20 is wired to a real server
- [ ] `debug_panel` remains `false` for general users (can be enabled per-user)
- [ ] No new `console.log` statements in production code paths
- [ ] No TODO/FIXME/HACK comments that represent shipped bugs
