import { addRxPlugin, createRxDatabase, removeRxDatabase, type RxCollection, type RxDatabase, type RxStorage } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import {
  collections,
  type AccountDoc,
  type AuthorDoc,
  type EditionDoc,
  type EntityResolutionDoc,
  type FetchQueueDoc,
  type InstanceDoc,
  type ShelfBookDoc,
  type ShelfDoc,
  type StatusDoc,
  type WorkDoc,
  type WriteQueueDoc
} from './schema';

export type RyuCollections = {
  instances: RxCollection<InstanceDoc>;
  accounts: RxCollection<AccountDoc>;
  works: RxCollection<WorkDoc>;
  editions: RxCollection<EditionDoc>;
  authors: RxCollection<AuthorDoc>;
  statuses: RxCollection<StatusDoc>;
  shelves: RxCollection<ShelfDoc>;
  shelfbooks: RxCollection<ShelfBookDoc>;
  entityresolutions: RxCollection<EntityResolutionDoc>;
  fetchqueue: RxCollection<FetchQueueDoc>;
  writequeue: RxCollection<WriteQueueDoc>;
};

export type RyuDatabase = RxDatabase<RyuCollections>;

const DATABASE_NAME = 'ryu-phase2';

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

export async function initializeDatabase(): Promise<RyuDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      registerDevelopmentPlugins();
      await requestPersistentStorage();

      const storage = import.meta.env.DEV
        ? wrappedValidateAjvStorage({ storage: getRxStorageDexie() })
        : getRxStorageDexie();

      try {
        return await createDatabaseInstance(storage);
      } catch (error) {
        if (import.meta.env.DEV && isSchemaMismatchError(error)) {
          await removeRxDatabase(DATABASE_NAME, storage, true);
          return createDatabaseInstance(storage);
        }

        throw error;
      }
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

export async function closeDatabaseForTests(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.close();
  dbPromise = null;
}

async function createDatabaseInstance(storage: RxStorage<any, any>): Promise<RyuDatabase> {
  const db = await createRxDatabase<RyuCollections>({
    name: DATABASE_NAME,
    storage,
    multiInstance: true,
    ignoreDuplicate: import.meta.env.DEV
  });

  await db.addCollections(collections);
  return db;
}

function isSchemaMismatchError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Error code: DB6');
}
