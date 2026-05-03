import type { PendingAuthTransaction } from "./types";

const STORAGE_KEY = "ryu.mastodon.pending_auth";
const MAX_TRANSACTION_AGE_MS = 10 * 60 * 1000;

function readStorageItem(storage: Storage | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorageItem(storage: Storage | null, value: string): void {
  try {
    storage?.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore storage failures and let the other storage backend carry the transaction.
  }
}

function removeStorageItem(storage: Storage | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function savePendingAuthTransaction(transaction: PendingAuthTransaction): void {
  const serialized = JSON.stringify(transaction);
  writeStorageItem(sessionStorage, serialized);
  writeStorageItem(localStorage, serialized);
}

export function loadPendingAuthTransaction(): PendingAuthTransaction | null {
  const raw = readStorageItem(sessionStorage) ?? readStorageItem(localStorage);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingAuthTransaction;
    if (Date.now() - parsed.createdAt > MAX_TRANSACTION_AGE_MS) {
      clearPendingAuthTransaction();
      return null;
    }

    return parsed;
  } catch {
    clearPendingAuthTransaction();
    return null;
  }
}

export function clearPendingAuthTransaction(): void {
  removeStorageItem(sessionStorage);
  removeStorageItem(localStorage);
}
