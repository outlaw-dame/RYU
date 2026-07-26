/**
 * One-way, owner-scoped localStorage → RxDB moderation migration.
 *
 * Completion is recorded only after every eligible write succeeds. A partial
 * failure therefore remains retryable; successful upserts are idempotent.
 */
import type { RyuDatabase } from "../db/client";
import type { ModerationFilterKeyword, ModerationPolicyDoc } from "../db/schema";
import { normalizeDomain } from "./domain-block-store";

const MIGRATION_KEY = "ryu:moderation-migration-v1";
const MAX_OWNER_ID_LENGTH = 512;

type MigrationCounts = {
  mutes: number;
  blocks: number;
  domains: number;
  filters: number;
};

type MigrationState = {
  completedAt: string;
  ownerAccountId: string;
  counts: MigrationCounts;
};

export function isMigrationComplete(ownerAccountId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(MIGRATION_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as MigrationState;
    return state.ownerAccountId === ownerAccountId && Boolean(state.completedAt);
  } catch {
    return false;
  }
}

function markMigrationComplete(ownerAccountId: string, counts: MigrationCounts): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify({
      completedAt: new Date().toISOString(),
      ownerAccountId,
      counts
    } satisfies MigrationState));
  } catch {
    // A missing marker is safe: the idempotent migration runs again.
  }
}

function readLocalStorageJson<T>(key: string): T[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function migrateModerationToRxDB(
  db: RyuDatabase,
  ownerAccountId: string
): Promise<MigrationCounts | null> {
  const owner = ownerAccountId.trim();
  if (!owner || owner.length > MAX_OWNER_ID_LENGTH) return null;
  if (isMigrationComplete(owner)) return null;
  if (!db.moderationpolicies) return null;

  const now = new Date().toISOString();
  const counts: MigrationCounts = { mutes: 0, blocks: 0, domains: 0, filters: 0 };
  let failures = 0;

  const upsert = async (doc: ModerationPolicyDoc, bucket: keyof MigrationCounts): Promise<void> => {
    try {
      await db.moderationpolicies.upsert(doc);
      counts[bucket] += 1;
    } catch {
      failures += 1;
    }
  };

  for (const entry of readLocalStorageJson<{
    accountId?: string;
    acct?: string;
    createdAt?: string;
    expiresAt?: string | null;
    hideNotifications?: boolean;
  }>("ryu:mute-list")) {
    const accountId = entry.accountId?.trim();
    if (!accountId) continue;
    await upsert({
      id: `local:mute:${owner}:${accountId}`,
      policyType: "account_mute",
      ownerAccountId: owner,
      source: "local",
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      accountId,
      acct: entry.acct,
      hideNotifications: entry.hideNotifications ?? true,
      expiresAt: entry.expiresAt ?? undefined
    }, "mutes");
  }

  for (const entry of readLocalStorageJson<{
    accountId?: string;
    acct?: string;
    createdAt?: string;
  }>("ryu:block-list")) {
    const accountId = entry.accountId?.trim();
    if (!accountId) continue;
    await upsert({
      id: `local:block:${owner}:${accountId}`,
      policyType: "account_block",
      ownerAccountId: owner,
      source: "local",
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      accountId,
      acct: entry.acct,
      hideNotifications: true
    }, "blocks");
  }

  for (const entry of readLocalStorageJson<{
    domain?: string;
    createdAt?: string;
    reason?: string;
  }>("ryu:domain-block-list")) {
    const domain = normalizeDomain(entry.domain ?? "");
    if (!domain) continue;
    await upsert({
      id: `local:domain:${owner}:${domain}`,
      policyType: "domain_block",
      ownerAccountId: owner,
      source: "local",
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      domain,
      severity: "block",
      reason: entry.reason
    }, "domains");
  }

  for (const entry of readLocalStorageJson<{
    id?: string;
    phrase?: string;
    wholeWord?: boolean;
    action?: string;
    createdAt?: string;
    expiresAt?: string | null;
  }>("ryu:content-filters")) {
    const id = entry.id?.trim();
    const phrase = entry.phrase?.trim();
    if (!id || !phrase) continue;
    const keyword: ModerationFilterKeyword = {
      id: `kw-${id}`,
      keyword: phrase,
      wholeWord: entry.wholeWord ?? false
    };
    const filterAction = (["warn", "hide", "blur"].includes(entry.action ?? "")
      ? entry.action
      : "hide") as ModerationPolicyDoc["filterAction"];
    await upsert({
      id: `local:filter:${owner}:${id}`,
      policyType: "filter",
      ownerAccountId: owner,
      source: "local",
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
      title: phrase.slice(0, 100),
      keywords: [keyword],
      contexts: ["home", "notifications", "public", "thread", "account"],
      filterAction,
      expiresAt: entry.expiresAt ?? undefined
    }, "filters");
  }

  if (failures > 0) {
    throw new Error("Moderation migration incomplete; retry required");
  }

  markMigrationComplete(owner, counts);
  return counts;
}

export function resetMigrationState(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(MIGRATION_KEY);
  } catch {
    // Non-fatal.
  }
}
