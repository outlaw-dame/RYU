import { runMigrations } from "./migrations";

export type DatabaseHandle = {
  ready: boolean;
  storage: "opfs" | "indexeddb" | "memory";
};

let singleton: Promise<DatabaseHandle> | null = null;

export function initializeDatabase(): Promise<DatabaseHandle> {
  singleton ??= (async () => {
    if (navigator.storage?.persist) {
      try { await navigator.storage.persist(); } catch { /* non-fatal */ }
    }
    await runMigrations();
    return { ready: true, storage: "opfs" };
  })();
  return singleton;
}
