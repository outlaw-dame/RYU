import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { collections } from './schema';

export type RyuDatabase = RxDatabase<typeof collections>;

let dbPromise: Promise<RyuDatabase> | null = null;

export async function initializeDatabase(): Promise<RyuDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (import.meta.env.DEV) {
        addRxPlugin(RxDBDevModePlugin);
      }

      if (navigator.storage?.persist) {
        try { await navigator.storage.persist(); } catch {}
      }

      const db = await createRxDatabase<RyuDatabase>({
        name: 'ryu',
        storage: getRxStorageDexie(),
        multiInstance: true,
        ignoreDuplicate: import.meta.env.DEV
      });

      await db.addCollections(collections);
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }

  return dbPromise;
}
