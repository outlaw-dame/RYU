/**
 * localStorage → RxDB moderation migration.
 *
 * Reads the Phase 35 localStorage-based moderation data and writes it
 * into the new RxDB moderation collections. This migration is:
 *
 * - IDEMPOTENT: safe to run any number of times. Uses upsert so
 *   re-running never duplicates data.
 * - ONE-WAY: writes to RxDB but never deletes from localStorage.
 *   localStorage remains the fallback if RxDB is unavailable.
 * - OWNER-SCOPED: every migrated document is tagged with ownerAccountId
 *   so multi-account isolation is enforced from the start.
 * - RESUMABLE: if interrupted, next run picks up where it left off
 *   because each item is upserted independently.
 *
 * Call `migrateModerationToRxDB(db, ownerAccountId)` after the database
 * is initialized and the user's session is known.
 */

import type { RyuDatabase } from '../db/client';
import type { ModerationPolicyDoc, ModerationFilterKeyword } from '../db/schema';

// ─── Migration State ──────────────────────────────────────────────────────────

const MIGRATION_KEY = 'ryu:moderation-migration-v1';

type MigrationState = {
  completedAt: string;
  ownerAccountId: string;
  counts: {
    mutes: number;
    blocks: number;
    domains: number;
    filters: number;
  };
};

/**
 * Check if migration has already completed for this owner.
 */
export function isMigrationComplete(ownerAccountId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(MIGRATION_KEY);
    if (!raw) return false;
    const state: MigrationState = JSON.parse(raw);
    return state.ownerAccountId === ownerAccountId && Boolean(state.completedAt);
  } catch {
    return false;
  }
}

/**
 * Record that migration completed successfully.
 */
function markMigrationComplete(ownerAccountId: string, counts: MigrationState['counts']): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const state: MigrationState = {
      completedAt: new Date().toISOString(),
      ownerAccountId,
      counts
    };
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal — migration will just re-run next time
  }
}

// ─── Data Readers (from localStorage) ─────────────────────────────────────────

function readLocalStorageJson<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Migration Logic ──────────────────────────────────────────────────────────

/**
 * Migrate localStorage moderation data into RxDB.
 *
 * @param db - The initialized RyuDatabase instance
 * @param ownerAccountId - The current user's account ID (for ownership tagging)
 * @returns The number of documents migrated, or null if skipped
 */
export async function migrateModerationToRxDB(
  db: RyuDatabase,
  ownerAccountId: string
): Promise<MigrationState['counts'] | null> {
  // Guard: don't migrate if already complete for this owner
  if (isMigrationComplete(ownerAccountId)) return null;

  // Guard: don't migrate if moderation collections aren't available
  if (!db.moderationpolicies) {
    return null;
  }

  // Validate owner ID to prevent IDOR (owner must be non-empty, reasonable length)
  const sanitizedOwner = ownerAccountId.trim();
  if (!sanitizedOwner || sanitizedOwner.length > 512) {
    console.warn('[moderation-migration] Invalid ownerAccountId, skipping migration.');
    return null;
  }

  const now = new Date().toISOString();
  const counts = { mutes: 0, blocks: 0, domains: 0, filters: 0 };

  // ─── Migrate mutes ───────────────────────────────────────────────────────
  const mutes = readLocalStorageJson<{
    accountId: string;
    acct?: string;
    createdAt?: string;
    expiresAt?: string | null;
    hideNotifications?: boolean;
  }>('ryu:mute-list');

  for (const entry of mutes) {
    if (!entry.accountId) continue;
    const doc: ModerationPolicyDoc = {
      id: `local:mute:${sanitizedOwner}:${entry.accountId}`,
      policyType: 'account_mute',
      ownerAccountId: sanitizedOwner,
      source: 'local',
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      accountId: entry.accountId,
      acct: entry.acct,
      hideNotifications: entry.hideNotifications ?? true,
      expiresAt: entry.expiresAt ?? undefined
    };
    try {
      await db.moderationpolicies.upsert(doc);
      counts.mutes++;
    } catch (err) {
      console.warn('[moderation-migration] Failed to migrate mute', entry.accountId, err);
    }
  }

  // ─── Migrate blocks ──────────────────────────────────────────────────────
  const blocks = readLocalStorageJson<{
    accountId: string;
    acct?: string;
    createdAt?: string;
  }>('ryu:block-list');

  for (const entry of blocks) {
    if (!entry.accountId) continue;
    const doc: ModerationPolicyDoc = {
      id: `local:block:${sanitizedOwner}:${entry.accountId}`,
      policyType: 'account_block',
      ownerAccountId: sanitizedOwner,
      source: 'local',
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      accountId: entry.accountId,
      acct: entry.acct,
      hideNotifications: true
    };
    try {
      await db.moderationpolicies.upsert(doc);
      counts.blocks++;
    } catch (err) {
      console.warn('[moderation-migration] Failed to migrate block', entry.accountId, err);
    }
  }

  // ─── Migrate domain blocks ───────────────────────────────────────────────
  const domains = readLocalStorageJson<{
    domain: string;
    createdAt?: string;
    reason?: string;
  }>('ryu:domain-block-list');

  for (const entry of domains) {
    if (!entry.domain) continue;
    const doc: ModerationPolicyDoc = {
      id: `local:domain:${sanitizedOwner}:${entry.domain}`,
      policyType: 'domain_block',
      ownerAccountId: sanitizedOwner,
      source: 'local',
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      domain: entry.domain,
      severity: 'block',
      reason: entry.reason
    };
    try {
      await db.moderationpolicies.upsert(doc);
      counts.domains++;
    } catch (err) {
      console.warn('[moderation-migration] Failed to migrate domain block', entry.domain, err);
    }
  }

  // ─── Migrate content filters ─────────────────────────────────────────────
  const filters = readLocalStorageJson<{
    id: string;
    phrase: string;
    wholeWord?: boolean;
    action?: string;
    createdAt?: string;
    expiresAt?: string | null;
  }>('ryu:content-filters');

  for (const entry of filters) {
    if (!entry.id || !entry.phrase) continue;
    const keyword: ModerationFilterKeyword = {
      id: `kw-${entry.id}`,
      keyword: entry.phrase,
      wholeWord: entry.wholeWord ?? false
    };
    const action = (['warn', 'hide', 'blur'].includes(entry.action ?? '') ? entry.action : 'hide') as ModerationPolicyDoc['filterAction'];
    const doc: ModerationPolicyDoc = {
      id: `local:filter:${sanitizedOwner}:${entry.id}`,
      policyType: 'filter',
      ownerAccountId: sanitizedOwner,
      source: 'local',
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      title: entry.phrase.slice(0, 100),
      keywords: [keyword],
      contexts: ['home', 'notifications', 'public', 'thread', 'account'],
      filterAction: action,
      expiresAt: entry.expiresAt ?? undefined
    };
    try {
      await db.moderationpolicies.upsert(doc);
      counts.filters++;
    } catch (err) {
      console.warn('[moderation-migration] Failed to migrate filter', entry.id, err);
    }
  }

  // ─── Mark complete ───────────────────────────────────────────────────────
  markMigrationComplete(sanitizedOwner, counts);
  return counts;
}

/**
 * Reset migration state (for testing or account switch).
 */
export function resetMigrationState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(MIGRATION_KEY);
  } catch {
    // Non-fatal
  }
}
