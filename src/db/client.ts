import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { collections } from './runtime-schema';
import { moderationCollections } from '../moderation/moderation-schema';
import type {
  AuthorDoc,
  BookWyrmInstanceDoc,
  EditionDoc,
  EntityLinkDoc,
  EntityResolutionDoc,
  FetchQueueDoc,
  ModerationPolicyDoc,
  ModerationRelationshipDoc,
  ModerationSyncStateDoc,
  ReviewDoc,
  SearchIndexDependencyDoc,
  SearchVectorDoc,
  WorkDoc,
  WriteQueueDoc
} from './schema';

export const DEFAULT_RYU_DATABASE_NAME = 'ryu';

export type RyuCollections = {
  authors: RxCollection<AuthorDoc>;
  works: RxCollection<WorkDoc>;
  editions: RxCollection<EditionDoc>;
  reviews: RxCollection<ReviewDoc>;
  entityresolutions: RxCollection<EntityResolutionDoc>;
  entitylinks: RxCollection<EntityLinkDoc>;
  bookwyrminstances: RxCollection<BookWyrmInstanceDoc>;
  searchvectors: RxCollection<SearchVectorDoc>;
  searchindexdependencies: RxCollection<SearchIndexDependencyDoc>;
  fetchqueue: RxCollection<FetchQueueDoc>;
  writequeue: RxCollection<WriteQueueDoc>;
  // Moderation collections (3 consolidated — within 16-collection limit)
  moderationpolicies: RxCollection<ModerationPolicyDoc>;
  moderationrelationships: RxCollection<ModerationRelationshipDoc>;
  moderationsyncstate: RxCollection<ModerationSyncStateDoc>;
};

export type RyuDatabase = RxDatabase<RyuCollections>;

let dbPromise: Promise<RyuDatabase> | null = null;
let devModePluginRegistered = false;
let migrationPluginRegistered = false;

function isDevelopmentRuntime(): boolean {
  return Boolean(import.meta.env?.DEV);
}

function registerCorePlugins(): void {
  if (migrationPluginRegistered) return;
  addRxPlugin(RxDBMigrationSchemaPlugin);
  migrationPluginRegistered = true;
}

function registerDevelopmentPlugins(): void {
  if (!isDevelopmentRuntime() || devModePluginRegistered) return;
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
      registerCorePlugins();
      registerDevelopmentPlugins();
      await requestPersistentStorage();

      const db = await createRxDatabase<RyuCollections>({
        name: DEFAULT_RYU_DATABASE_NAME,
        storage: getRxStorageDexie(),
        multiInstance: true,
        ignoreDuplicate: isDevelopmentRuntime()
      });

      // Register core collections (must succeed — app cannot function without them)
      await db.addCollections(collections as any);

      // Register moderation collections (additive — failure here is non-fatal,
      // the app falls back to localStorage-based moderation)
      try {
        await db.addCollections(moderationCollections as any);
      } catch (err) {
        console.warn('[db] Moderation collections failed to register. Falling back to localStorage.', err);
      }

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
