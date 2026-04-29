import type { PendingAuthTransaction } from "./types";

const STORAGE_KEY = "ryu.mastodon.pending_auth";
const MAX_TRANSACTION_AGE_MS = 10 * 60 * 1000;

export function savePendingAuthTransaction(transaction: PendingAuthTransaction): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transaction));
}

export function loadPendingAuthTransaction(): PendingAuthTransaction | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
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
  sessionStorage.removeItem(STORAGE_KEY);
}
