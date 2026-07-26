export type AsyncScopeRequestToken = Readonly<{
  scopeKey: string;
  generation: number;
}>;

export type AsyncScopeGuard = {
  setScope(scopeKey: string): boolean;
  isScopeActive(scopeKey: string): boolean;
  begin(scopeKey: string): AsyncScopeRequestToken | null;
  isCurrent(token: AsyncScopeRequestToken): boolean;
  invalidate(): void;
  dispose(): void;
};

/**
 * Coordinates async work whose results are valid only for one authenticated
 * scope. Starting newer work invalidates older work, and changing scope makes
 * every token issued for the previous scope stale.
 */
export function createAsyncScopeGuard(initialScopeKey: string): AsyncScopeGuard {
  let activeScopeKey = normalizeScopeKey(initialScopeKey);
  let generation = 0;
  let disposed = false;

  return Object.freeze({
    setScope(scopeKey: string): boolean {
      if (disposed) return false;
      const normalized = normalizeScopeKey(scopeKey);
      if (normalized === activeScopeKey) return false;
      activeScopeKey = normalized;
      generation += 1;
      return true;
    },

    isScopeActive(scopeKey: string): boolean {
      if (disposed) return false;
      return normalizeScopeKey(scopeKey) === activeScopeKey;
    },

    begin(scopeKey: string): AsyncScopeRequestToken | null {
      if (disposed) return null;
      const normalized = normalizeScopeKey(scopeKey);
      if (normalized !== activeScopeKey) return null;
      generation += 1;
      return Object.freeze({ scopeKey: activeScopeKey, generation });
    },

    isCurrent(token: AsyncScopeRequestToken): boolean {
      return !disposed
        && token.scopeKey === activeScopeKey
        && token.generation === generation;
    },

    invalidate(): void {
      if (!disposed) generation += 1;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      generation += 1;
    }
  });
}

function normalizeScopeKey(scopeKey: string): string {
  if (typeof scopeKey !== "string") throw new Error("Async scope key must be a string");
  const normalized = scopeKey.trim();
  if (!normalized) throw new Error("Async scope key is required");
  if (normalized.length > 4096) throw new Error("Async scope key is too long");
  return normalized;
}
