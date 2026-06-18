/**
 * Phase 27: Resolution store.
 *
 * CRUD operations for canonical -> alias mappings, backed by the
 * entityresolutions RxDB collection.
 */

import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { EntityType } from '../db/schema';
import type { ResolutionRecord } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Write a resolution record mapping aliasUri -> canonicalEntityId.
 */
export async function writeResolution(
  db: RyuDatabase,
  aliasUri: string,
  entityType: EntityType,
  canonicalEntityId: string
): Promise<ResolutionRecord> {
  const id = `res:${aliasUri}`;
  const record: ResolutionRecord = {
    id,
    canonicalUri: aliasUri,
    entityType,
    entityId: canonicalEntityId,
    resolvedAt: nowIso()
  };

  await db.entityresolutions.upsert(record);
  return record;
}

/**
 * Resolve a URI to its canonical entity ID.
 * Returns undefined if the URI is not an alias.
 */
export async function resolveUri(
  db: RyuDatabase,
  uri: string
): Promise<string | undefined> {
  const doc = await db.entityresolutions.findOne({
    selector: { canonicalUri: uri }
  }).exec();

  if (!doc) return undefined;
  return doc.toJSON().entityId;
}

/**
 * Get all alias URIs that map to a given canonical entity.
 */
export async function getAliasesForEntity(
  db: RyuDatabase,
  entityId: string
): Promise<ResolutionRecord[]> {
  const docs = await db.entityresolutions.find({
    selector: { entityId }
  }).exec();

  return docs.map((doc) => doc.toJSON() as ResolutionRecord);
}

/**
 * Remove a resolution record by its ID.
 */
export async function removeResolution(
  db: RyuDatabase,
  resolutionId: string
): Promise<void> {
  const doc = await db.entityresolutions.findOne({
    selector: { id: resolutionId }
  }).exec();

  if (doc) {
    await doc.remove();
  }
}

/**
 * Write multiple resolution records atomically (for batch merge).
 */
export async function writeResolutions(
  db: RyuDatabase,
  records: Array<{ aliasUri: string; entityType: EntityType; canonicalEntityId: string }>
): Promise<ResolutionRecord[]> {
  const results: ResolutionRecord[] = [];
  for (const { aliasUri, entityType, canonicalEntityId } of records) {
    const record = await writeResolution(db, aliasUri, entityType, canonicalEntityId);
    results.push(record);
  }
  return results;
}

/**
 * Convenience: initialize database and resolve a URI.
 */
export async function resolveEntityUri(uri: string): Promise<string | undefined> {
  const db = await initializeDatabase();
  return resolveUri(db, uri);
}
