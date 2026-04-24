import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import {
  collections,
  type AuthorDoc,
  type EditionDoc,
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
  fetchqueue: RxCollection<FetchQueueDoc>;
  writequeue: RxCollection<WriteQueueDoc>;
};

export type RyuDatabase = RxDatabase<RyuCollections>;

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
