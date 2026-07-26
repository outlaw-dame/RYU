import type { ModerationProxyAction } from "./moderation-proxy-api";

export type ModerationQueueItem = {
  id: string;
  ownerAccountId: string;
  action: ModerationProxyAction;
  createdAt: string;
  attempts: number;
  nextAttemptAt: number;
};

const PREFIX = "ryu:moderation-sync-queue:v1:";
const MAX_QUEUE = 100;
const MAX_OWNER_LENGTH = 512;

export function loadModerationQueue(ownerAccountId: string): ModerationQueueItem[] {
  const owner = validateOwner(ownerAccountId);
  if (!owner || typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(owner)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is ModerationQueueItem => isValidItem(value, owner)).slice(-MAX_QUEUE);
  } catch { return []; }
}

export function enqueueModerationAction(ownerAccountId: string, action: ModerationProxyAction): ModerationQueueItem[] {
  const owner = validateOwner(ownerAccountId);
  if (!owner || !isValidAction(action)) return loadModerationQueue(ownerAccountId);
  const queue = loadModerationQueue(owner);
  const key = actionKey(action);
  const withoutConflict = queue.filter((item) => actionKey(item.action) !== key);
  const now = Date.now();
  withoutConflict.push({ id: `${now.toString(36)}-${cryptoSafeId()}`, ownerAccountId: owner, action, createdAt: new Date(now).toISOString(), attempts: 0, nextAttemptAt: now });
  const bounded = withoutConflict.slice(-MAX_QUEUE);
  save(owner, bounded);
  return bounded;
}

export function replaceModerationQueue(ownerAccountId: string, queue: readonly ModerationQueueItem[]): ModerationQueueItem[] {
  const owner = validateOwner(ownerAccountId);
  if (!owner) return [];
  const valid = queue.filter((item) => isValidItem(item, owner)).slice(-MAX_QUEUE);
  save(owner, valid);
  return valid;
}

export function clearModerationQueue(ownerAccountId: string): void {
  const owner = validateOwner(ownerAccountId);
  if (owner && typeof localStorage !== "undefined") localStorage.removeItem(storageKey(owner));
}

export function moderationQueueStorageKey(ownerAccountId: string): string | null {
  const owner = validateOwner(ownerAccountId);
  return owner ? storageKey(owner) : null;
}

export function actionKey(action: ModerationProxyAction): string {
  switch (action.kind) {
    case "mute":
    case "unmute": return `mute:${action.accountId}`;
    case "block":
    case "unblock": return `block:${action.accountId}`;
    case "domain_block":
    case "domain_unblock": return `domain:${action.domain}`;
    case "filter_create": return `filter:${filterSignature(action.keyword, action.wholeWord, action.filterAction)}`;
    case "filter_delete": return `filter:${filterSignature(action.keyword, action.wholeWord, action.filterAction)}`;
  }
}

function filterSignature(keyword: string, wholeWord: boolean, action: "warn" | "hide"): string {
  return `${keyword.trim().toLocaleLowerCase()}\u001f${wholeWord ? "1" : "0"}\u001f${action}`;
}
function storageKey(owner: string): string { return `${PREFIX}${encodeURIComponent(owner)}`; }
function save(owner: string, queue: readonly ModerationQueueItem[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(storageKey(owner), JSON.stringify(queue)); } catch { /* local policy remains authoritative */ }
}
function validateOwner(value: string): string | null {
  const owner = typeof value === "string" ? value.trim() : "";
  return owner && owner.length <= MAX_OWNER_LENGTH ? owner : null;
}
function isValidItem(value: unknown, owner: string): value is ModerationQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ModerationQueueItem>;
  return item.ownerAccountId === owner && typeof item.id === "string" && item.id.length <= 128 && typeof item.createdAt === "string" && Number.isInteger(item.attempts) && (item.attempts ?? -1) >= 0 && typeof item.nextAttemptAt === "number" && Number.isFinite(item.nextAttemptAt) && isValidAction(item.action);
}
function isValidAction(value: unknown): value is ModerationProxyAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  const kind = action.kind;
  if (kind === "mute" || kind === "unmute" || kind === "block" || kind === "unblock") return bounded(action.accountId, 128);
  if (kind === "domain_block" || kind === "domain_unblock") return bounded(action.domain, 253);
  if (kind === "filter_create" || kind === "filter_delete") return bounded(action.keyword, 200) && typeof action.wholeWord === "boolean" && (action.filterAction === "warn" || action.filterAction === "hide") && (kind !== "filter_create" || bounded(action.title, 200));
  return false;
}
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function cryptoSafeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 14);
}
