import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { collections } from './schema';

export type RyuDatabase = RxDatabase<typeof collections>;

let dbPromise: Promise<RyuDatabase> | null = null;
let devModeRegistered = false;

function registerDevelopmentPlugins() {
  if (import.meta.env.DEV && !devModeRegistered) {
    addRxPlugin(RxDBDevModePlugin);
    devModeRegistered = true;
  }
}

async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getDatabase(): Promise<RyuDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      registerDevelopmentPlugins();
      await requestPersistentStorage();

      const db = await createRxDatabase<RyuDatabase>({
        name: 'ryu',
        storage: getRxStorageDexie(),
        multiInstance: true,
        ignoreDuplicate: import.meta.env.DEV
      });

      await db.addCollections(collections);
      return db;
    })();
  }

  return dbPromise;
}

export const initializeDatabase = getDatabase;

export async function closeDatabaseForTests(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.close();
  dbPromise = null;
}
