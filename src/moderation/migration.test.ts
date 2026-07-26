import 'fake-indexeddb/auto';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RyuDatabase } from '../db/client';
import { moderationCollections } from './moderation-schema';
import {
  isMigrationComplete,
  migrateModerationToRxDB,
  resetMigrationState
} from './migration';

// ─── Test Setup ───────────────────────────────────────────────────────────────

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

let db: RyuDatabase;
let mockStorage: MemoryStorage;

beforeAll(async () => {
  try { addRxPlugin(RxDBMigrationSchemaPlugin); } catch { /* already registered */ }
  
  mockStorage = new MemoryStorage();
  vi.stubGlobal('localStorage', mockStorage);

  db = await createRxDatabase<any>({
    name: `mig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    storage: getRxStorageDexie(),
    multiInstance: false
  });
  await db.addCollections(moderationCollections as any);
});

beforeEach(async () => {
  mockStorage.clear();
  resetMigrationState();
  // Clean the shared DB between tests
  const allDocs = await db.moderationpolicies.find().exec();
  if (allDocs.length > 0) {
    await db.moderationpolicies.bulkRemove(allDocs.map((d: any) => d.id));
  }
});

afterEach(() => {
  resetMigrationState();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('moderation localStorage → RxDB migration', () => {
  const OWNER = 'user:alice@books.example';

  it('migrates mutes from localStorage to RxDB', async () => {
    mockStorage.setItem('ryu:mute-list', JSON.stringify([
      { accountId: 'acc-1', acct: 'spam@evil.tld', createdAt: '2025-01-01T00:00:00Z', hideNotifications: true, expiresAt: null }
    ]));

    const result = await migrateModerationToRxDB(db as any, OWNER);

    expect(result).not.toBeNull();
    expect(result!.mutes).toBe(1);

    const docs = await db.moderationpolicies.find({ selector: { policyType: 'account_mute' } }).exec();
    expect(docs).toHaveLength(1);
    expect(docs[0].accountId).toBe('acc-1');
    expect(docs[0].policyType).toBe('account_mute');
    expect(docs[0].ownerAccountId).toBe(OWNER);
  });

  it('migrates blocks from localStorage to RxDB', async () => {
    mockStorage.setItem('ryu:block-list', JSON.stringify([
      { accountId: 'acc-2', acct: 'troll@bad.tld', createdAt: '2025-02-01T00:00:00Z' }
    ]));

    const result = await migrateModerationToRxDB(db as any, OWNER);

    expect(result!.blocks).toBe(1);
    const docs = await db.moderationpolicies.find({ selector: { policyType: 'account_block' } }).exec();
    expect(docs).toHaveLength(1);
    expect(docs[0].accountId).toBe('acc-2');
    expect(docs[0].ownerAccountId).toBe(OWNER);
  });

  it('migrates domain blocks from localStorage to RxDB', async () => {
    mockStorage.setItem('ryu:domain-block-list', JSON.stringify([
      { domain: 'evil.example', createdAt: '2025-03-01T00:00:00Z', reason: 'spam instance' }
    ]));

    const result = await migrateModerationToRxDB(db as any, OWNER);

    expect(result!.domains).toBe(1);
    const docs = await db.moderationpolicies.find({ selector: { policyType: 'domain_block' } }).exec();
    expect(docs).toHaveLength(1);
    expect(docs[0].domain).toBe('evil.example');
    expect(docs[0].severity).toBe('block');
    expect(docs[0].reason).toBe('spam instance');
  });

  it('migrates content filters from localStorage to RxDB', async () => {
    mockStorage.setItem('ryu:content-filters', JSON.stringify([
      { id: 'f-1', phrase: 'spoiler', wholeWord: true, action: 'warn', createdAt: '2025-04-01T00:00:00Z', expiresAt: null }
    ]));

    const result = await migrateModerationToRxDB(db as any, OWNER);

    expect(result!.filters).toBe(1);
    const docs = await db.moderationpolicies.find({ selector: { policyType: 'filter' } }).exec();
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('spoiler');
    expect(docs[0].keywords![0].keyword).toBe('spoiler');
    expect(docs[0].keywords![0].wholeWord).toBe(true);
    expect(docs[0].filterAction).toBe('warn');
  });

  it('is idempotent — second run returns null (already complete)', async () => {
    mockStorage.setItem('ryu:mute-list', JSON.stringify([
      { accountId: 'acc-1', createdAt: '2025-01-01T00:00:00Z', hideNotifications: true, expiresAt: null }
    ]));

    const first = await migrateModerationToRxDB(db as any, OWNER);
    expect(first).not.toBeNull();

    const second = await migrateModerationToRxDB(db as any, OWNER);
    expect(second).toBeNull();

    // Data is still there, not duplicated
    const docs = await db.moderationpolicies.find().exec();
    expect(docs).toHaveLength(1);
  });

  it('enforces owner isolation — different owner does not see other owner data', async () => {
    mockStorage.setItem('ryu:block-list', JSON.stringify([
      { accountId: 'acc-shared', createdAt: '2025-01-01T00:00:00Z' }
    ]));

    await migrateModerationToRxDB(db as any, 'user:alice');
    resetMigrationState();
    await migrateModerationToRxDB(db as any, 'user:bob');

    const aliceDocs = await db.moderationpolicies.find({
      selector: { ownerAccountId: 'user:alice' }
    }).exec();
    const bobDocs = await db.moderationpolicies.find({
      selector: { ownerAccountId: 'user:bob' }
    }).exec();

    expect(aliceDocs).toHaveLength(1);
    expect(bobDocs).toHaveLength(1);
    expect(aliceDocs[0].id).not.toBe(bobDocs[0].id);
  });

  it('skips entries with missing accountId', async () => {
    mockStorage.setItem('ryu:mute-list', JSON.stringify([
      { accountId: '', hideNotifications: true },
      { acct: 'noAccountId@test.tld', hideNotifications: true },
      { accountId: 'valid', hideNotifications: true, expiresAt: null }
    ]));

    const result = await migrateModerationToRxDB(db as any, OWNER);
    expect(result!.mutes).toBe(1);
  });

  it('rejects empty or oversized ownerAccountId', async () => {
    mockStorage.setItem('ryu:block-list', JSON.stringify([
      { accountId: 'acc-1', createdAt: '2025-01-01T00:00:00Z' }
    ]));

    const emptyResult = await migrateModerationToRxDB(db as any, '');
    expect(emptyResult).toBeNull();

    const longResult = await migrateModerationToRxDB(db as any, 'x'.repeat(600));
    expect(longResult).toBeNull();
  });

  it('returns null when moderation collections are not available', async () => {
    // Create a DB without moderation collections
    const minimalDb = await createRxDatabase<any>({
      name: `nomod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      storage: getRxStorageDexie(),
      multiInstance: false
    });

    mockStorage.setItem('ryu:mute-list', JSON.stringify([
      { accountId: 'acc-1', hideNotifications: true, expiresAt: null }
    ]));

    const result = await migrateModerationToRxDB(minimalDb as any, OWNER);
    expect(result).toBeNull();
  });

  it('isMigrationComplete returns correct state', async () => {
    expect(isMigrationComplete(OWNER)).toBe(false);

    mockStorage.setItem('ryu:mute-list', JSON.stringify([]));
    await migrateModerationToRxDB(db as any, OWNER);

    expect(isMigrationComplete(OWNER)).toBe(true);
    expect(isMigrationComplete('other-user')).toBe(false);
  });

  it('handles corrupted localStorage gracefully', async () => {
    mockStorage.setItem('ryu:mute-list', 'not valid json!!!');
    mockStorage.setItem('ryu:block-list', '{"not": "array"}');
    mockStorage.setItem('ryu:domain-block-list', '42');

    const result = await migrateModerationToRxDB(db as any, OWNER);
    expect(result).not.toBeNull();
    expect(result!.mutes).toBe(0);
    expect(result!.blocks).toBe(0);
    expect(result!.domains).toBe(0);
  });
});
