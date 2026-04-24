import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import {
  collections,
  type AuthorDoc,
  type BookWyrmInstanceDoc,
  type EditionDoc,
  type EntityLinkDoc,
  type EntityResolutionDoc,
  type FetchQueueDoc,
  type ReviewDoc,
  type WorkDoc,
  type WriteQueueDoc
} from './schema';

export type RyuCollections = {
  authors: RxCollection<AuthorDoc>;
  works: RxCollection<WorkDoc>;
  editions: RxCollection<EditionDoc>;
  reviews: RxCollection<ReviewDoc>;
  entityresolutions: RxCollection<EntityResolutionDoc>;
  entitylinks: RxCollection<EntityLinkDoc>;
  bookwyrminstances: RxCollection<BookWyrmInstanceDoc>;
  fetchqueue: RxCollection<FetchQueueDoc>;
  writequeue: RxCollection<WriteQueueDoc>;
};

export type RyuDatabase = RxDatabase<RyuCollections>;

let dbPromise: Promise<RyuDatabase> | null = null;
let devModePluginRegistered = false;

function registerDevelopmentPlugins(): void {
  if (!import.meta.env.DEV || devModePluginRegistered) return;
  addRxPlugin(RxDBDevModePlugin);
  devModePluginRegistered = true;
}

async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // Persistence is best-effort. IndexedDB remains usable even when browsers
    // deny persistent storage; callers should not fail because of this request.
  }
}

export async function initializeDatabase(): Promise<RyuDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      registerDevelopmentPlugins();
      await requestPersistentStorage();

      const db = await createRxDatabase<RyuCollections>({
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

export function getDatabase(): Promise<RyuDatabase> {
  return initializeDatabase();
}
