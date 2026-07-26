export const MODERATION_QUEUE_EVENT = "ryu:moderation-queue-sync";

const STORAGE_PREFIX = "ryu:moderation-queue:v1:";
const MAX_QUEUE_ITEMS = 1_000;
const MAX_OWNER_LENGTH = 1_024;
const MAX_TARGET_LENGTH = 2_048;
const MAX_REASON_LENGTH = 1_024;

export type ModerationQueueActionType =
  | "mute" | "unmute" | "block" | "unblock"
  | "domain_block" | "domain_unblock"
  | "filter_create" | "filter_delete";

export type ModerationQueuePayload = {
  accountId?: string;
  domain?: string;
  filterId?: string;
  phrase?: string;
  wholeWord?: boolean;
  action?: "hide" | "warn" | "blur";
  notifications?: boolean;
  durationSeconds?: number;
  reason?: string;
};

export type ModerationQueueItem = {
  id: string;
  ownerAccountId: string;
  type: ModerationQueueActionType;
  targetKey: string;
  payload: ModerationQueuePayload;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastErrorCode?: string;
};

function storageKey(ownerAccountId: string): string | null {
  const owner = ownerAccountId.trim();
  return owner && owner.length <= MAX_OWNER_LENGTH ? `${STORAGE_PREFIX}${encodeURIComponent(owner)}` : null;
}

function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function isActionType(value: unknown): value is ModerationQueueActionType {
  return ["mute", "unmute", "block", "unblock", "domain_block", "domain_unblock", "filter_create", "filter_delete"].includes(String(value));
}

function validatePayload(payload: unknown): payload is ModerationQueuePayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const value = payload as ModerationQueuePayload;
  const strings = [value.accountId, value.domain, value.filterId, value.phrase];
  if (strings.some((entry) => entry != null && (typeof entry !== "string" || !entry.trim() || entry.length > MAX_TARGET_LENGTH))) return false;
  if (value.reason != null && (typeof value.reason !== "string" || value.reason.length > MAX_REASON_LENGTH)) return false;
  if (value.durationSeconds != null && (!Number.isInteger(value.durationSeconds) || value.durationSeconds < 0 || value.durationSeconds > 31_536_000)) return false;
  return true;
}

function isQueueItem(value: unknown, owner: string): value is ModerationQueueItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as ModerationQueueItem;
  return typeof item.id === "string" && item.id.length <= 256 && item.ownerAccountId === owner &&
    isActionType(item.type) && typeof item.targetKey === "string" && item.targetKey.length > 0 &&
    item.targetKey.length <= MAX_TARGET_LENGTH + 32 && validatePayload(item.payload) &&
    Number.isInteger(item.attempts) && item.attempts >= 0 && item.attempts <= 100 &&
    Number.isFinite(Date.parse(item.createdAt)) && Number.isFinite(Date.parse(item.updatedAt)) &&
    Number.isFinite(Date.parse(item.nextAttemptAt));
}

export function moderationTargetKey(type: ModerationQueueActionType, payload: ModerationQueuePayload): string | null {
  const accountId = payload.accountId?.trim();
  if (type === "mute" || type === "unmute") return accountId ? `mute:${accountId}` : null;
  if (type === "block" || type === "unblock") return accountId ? `block:${accountId}` : null;
  if (type === "domain_block" || type === "domain_unblock") {
    const domain = payload.domain?.trim().toLowerCase();
    return domain ? `domain:${domain}` : null;
  }
  const filterId = payload.filterId?.trim();
  return filterId ? `filter:${filterId}` : null;
}

export function loadModerationQueue(ownerAccountId: string): ModerationQueueItem[] {
  const owner = ownerAccountId.trim();
  const key = storageKey(owner);
  const storage = safeStorage();
  if (!key || !storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is ModerationQueueItem => isQueueItem(item, owner)).slice(0, MAX_QUEUE_ITEMS) : [];
  } catch { return []; }
}

function persist(ownerAccountId: string, items: readonly ModerationQueueItem[]): void {
  const key = storageKey(ownerAccountId);
  const storage = safeStorage();
  if (!key || !storage) return;
  try {
    storage.setItem(key, JSON.stringify(items.slice(0, MAX_QUEUE_ITEMS)));
    window.dispatchEvent(new CustomEvent(MODERATION_QUEUE_EVENT, { detail: { ownerAccountId } }));
  } catch { /* Local moderation remains authoritative. */ }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function enqueueModerationAction(ownerAccountId: string, type: ModerationQueueActionType, payload: ModerationQueuePayload, now = new Date()): ModerationQueueItem[] {
  const owner = ownerAccountId.trim();
  const targetKey = moderationTargetKey(type, payload);
  if (!storageKey(owner) || !targetKey || !validatePayload(payload)) return loadModerationQueue(owner);
  const timestamp = now.toISOString();
  const item: ModerationQueueItem = { id: randomId(), ownerAccountId: owner, type, targetKey, payload, createdAt: timestamp, updatedAt: timestamp, attempts: 0, nextAttemptAt: timestamp };
  const compacted = loadModerationQueue(owner).filter((existing) => existing.targetKey !== targetKey);
  if (compacted.length >= MAX_QUEUE_ITEMS) compacted.shift();
  compacted.push(item);
  persist(owner, compacted);
  return compacted;
}

export function removeModerationQueueItem(ownerAccountId: string, itemId: string): ModerationQueueItem[] {
  const queue = loadModerationQueue(ownerAccountId).filter((item) => item.id !== itemId);
  persist(ownerAccountId, queue);
  return queue;
}

export function deferModerationQueueItem(ownerAccountId: string, itemId: string, nextAttemptAt: Date, errorCode: string): ModerationQueueItem[] {
  const queue = loadModerationQueue(ownerAccountId).map((item) => item.id === itemId ? {
    ...item, attempts: Math.min(100, item.attempts + 1), updatedAt: new Date().toISOString(),
    nextAttemptAt: nextAttemptAt.toISOString(), lastErrorCode: errorCode.slice(0, 64)
  } : item);
  persist(ownerAccountId, queue);
  return queue;
}

export function clearModerationQueue(ownerAccountId: string): void {
  const key = storageKey(ownerAccountId);
  const storage = safeStorage();
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
    window.dispatchEvent(new CustomEvent(MODERATION_QUEUE_EVENT, { detail: { ownerAccountId } }));
  } catch { /* Ignore unavailable storage. */ }
}
