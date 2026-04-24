import { runMigrations } from "./migrations";

export type DatabaseHandle = {
  ready: boolean;
  storage: "opfs" | "indexeddb" | "memory";
};

let singleton: Promise<DatabaseHandle> | null = null;

export function initializeDatabase(): Promise<DatabaseHandle> {
  singleton ??= (async () => {
    try {
      if (navigator.storage?.persist) {
        try { await navigator.storage.persist(); } catch { /* non-fatal */ }
      }
      await runMigrations();
      return { ready: true, storage: "opfs" };
    } catch (error) {
      singleton = null;
      throw error;
    }
  })();
  return singleton;
}
