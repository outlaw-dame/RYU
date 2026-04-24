import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';

addRxPlugin(RxDBDevModePlugin);

let dbPromise: Promise<any> | null = null;

export async function getDatabase() {
  if (!dbPromise) {
    dbPromise = createRxDatabase({
      name: 'ryu',
      storage: getRxStorageDexie(),
      multiInstance: true
    });
  }
  return dbPromise;
}
