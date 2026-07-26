/**
 * One-way, owner-scoped localStorage → RxDB moderation migration.
 *
 * Completion is recorded only after every eligible write succeeds. Legacy
 * records are normalized to schema bounds before upsert so permanently invalid
 * local data cannot poison every retry.
 */
import type { RyuDatabase } from "../db/client";
import type { ModerationFilterKeyword, ModerationPolicyDoc } from "../db/schema";
import { normalizeDomain } from "./domain-block-store";

const MIGRATION_KEY = "ryu:moderation-migration-v1";
const MAX_OWNER_ID_LENGTH = 512;
const MAX_ID_LENGTH = 2048;
const MAX_SHORT_TEXT_LENGTH = 512;
const MAX_TEXT_LENGTH = 4096;

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
    // A missing marker is safe because upserts are idempotent.
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

function bounded(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function timestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function policyId(...parts: string[]): string | null {
  const id = parts.join(":");
  return id.length <= MAX_ID_LENGTH ? id : null;
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
    const accountId = bounded(entry.accountId, MAX_ID_LENGTH);
    if (!accountId) continue;
    const id = policyId("local", "mute", owner, accountId);
    if (!id) continue;
    await upsert({
      id,
      policyType: "account_mute",
      ownerAccountId: owner,
      source: "local",
      createdAt: timestamp(entry.createdAt, now),
      updatedAt: now,
      accountId,
      acct: bounded(entry.acct, MAX_SHORT_TEXT_LENGTH),
      hideNotifications: entry.hideNotifications ?? true,
      expiresAt: entry.expiresAt ? timestamp(entry.expiresAt, now) : undefined
    }, "mutes");
  }

  for (const entry of readLocalStorageJson<{
    accountId?: string;
    acct?: string;
    createdAt?: string;
  }>("ryu:block-list")) {
    const accountId = bounded(entry.accountId, MAX_ID_LENGTH);
    if (!accountId) continue;
    const id = policyId("local", "block", owner, accountId);
    if (!id) continue;
    await upsert({
      id,
      policyType: "account_block",
      ownerAccountId: owner,
      source: "local",
      createdAt: timestamp(entry.createdAt, now),
      updatedAt: now,
      accountId,
      acct: bounded(entry.acct, MAX_SHORT_TEXT_LENGTH),
      hideNotifications: true
    }, "blocks");
  }

  for (const entry of readLocalStorageJson<{
    domain?: string;
    createdAt?: string;
    reason?: string;
  }>("ryu:domain-block-list")) {
    const domain = bounded(normalizeDomain(entry.domain ?? ""), MAX_SHORT_TEXT_LENGTH);
    if (!domain) continue;
    const id = policyId("local", "domain", owner, domain);
    if (!id) continue;
    await upsert({
      id,
      policyType: "domain_block",
      ownerAccountId: owner,
      source: "local",
      createdAt: timestamp(entry.createdAt, now),
      updatedAt: now,
      domain,
      severity: "block",
      reason: bounded(entry.reason, MAX_TEXT_LENGTH)
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
    const legacyId = bounded(entry.id, MAX_SHORT_TEXT_LENGTH);
    const phrase = bounded(entry.phrase, MAX_TEXT_LENGTH);
    if (!legacyId || !phrase) continue;
    const id = policyId("local", "filter", owner, legacyId);
    if (!id) continue;
    const keywordId = bounded(`kw-${legacyId}`, MAX_ID_LENGTH);
    if (!keywordId) continue;
    const keyword: ModerationFilterKeyword = {
      id: keywordId,
      keyword: phrase,
      wholeWord: entry.wholeWord ?? false
    };
    const filterAction = (["warn", "hide", "blur"].includes(entry.action ?? "")
      ? entry.action
      : "hide") as ModerationPolicyDoc["filterAction"];
    await upsert({
      id,
      policyType: "filter",
      ownerAccountId: owner,
      source: "local",
      createdAt: timestamp(entry.createdAt, now),
      updatedAt: now,
      title: phrase.slice(0, 100),
      keywords: [keyword],
      contexts: ["home", "notifications", "public", "thread", "account"],
      filterAction,
      expiresAt: entry.expiresAt ? timestamp(entry.expiresAt, now) : undefined
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
