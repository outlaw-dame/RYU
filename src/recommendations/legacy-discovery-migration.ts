import type { UserSignalEntityType } from "./user-signal-schema";
import {
  normalizeUserSignalScope,
  type UserSignalScope
} from "./user-signal-store";
import { upsertUserSignal } from "./user-signal-store";

export const LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY = "ryu.discovery.controls.v1";
const MIGRATION_MARKER_PREFIX = "ryu.discovery.controls.v1.migration.v1";
const MAX_LEGACY_PAYLOAD_BYTES = 1_000_000;
const MAX_LEGACY_EXCLUSIONS = 10_000;
const MAX_ENTITY_ID_LENGTH = 2048;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type MigratableEntityType = Extract<UserSignalEntityType, "author" | "edition">;

export type LegacyDiscoveryEntityResolver = (
  entityId: string
) => MigratableEntityType | null | Promise<MigratableEntityType | null>;

export type LegacyDiscoveryMigrationResult = {
  status: "no_data" | "complete" | "partial" | "already_complete";
  migratedIds: string[];
  unresolvedIds: string[];
  invalidEntryCount: number;
};

export type LegacyDiscoveryMigrationOptions = {
  scope: UserSignalScope;
  resolveEntityType: LegacyDiscoveryEntityResolver;
  storage?: StorageLike;
  now?: Date;
  writeSignal?: typeof upsertUserSignal;
};

/**
 * Migrates legacy bare-ID discovery exclusions into durable explicit signals.
 *
 * The legacy format did not persist whether an ID referred to an author or an
 * edition. This migration therefore requires a resolver and never guesses.
 * The legacy source key is intentionally retained. A scoped completion marker
 * is written only after every valid entry has been resolved and persisted.
 */
export async function migrateLegacyDiscoveryExclusions(
  options: LegacyDiscoveryMigrationOptions
): Promise<LegacyDiscoveryMigrationResult> {
  const storage = options.storage ?? getBrowserStorage();
  const scope = normalizeUserSignalScope(options.scope);
  const parsed = readLegacyExclusions(storage);

  if (parsed.ids.length === 0) {
    return {
      status: "no_data",
      migratedIds: [],
      unresolvedIds: [],
      invalidEntryCount: parsed.invalidEntryCount
    };
  }

  const markerKey = buildMigrationMarkerKey(scope);
  const fingerprint = fingerprintIds(parsed.ids);
  if (storage.getItem(markerKey) === fingerprint) {
    return {
      status: "already_complete",
      migratedIds: [],
      unresolvedIds: [],
      invalidEntryCount: parsed.invalidEntryCount
    };
  }

  const now = options.now ?? new Date();
  const writeSignal = options.writeSignal ?? upsertUserSignal;
  const migratedIds: string[] = [];
  const unresolvedIds: string[] = [];

  for (const entityId of parsed.ids) {
    const entityType = await options.resolveEntityType(entityId);
    if (entityType !== "author" && entityType !== "edition") {
      unresolvedIds.push(entityId);
      continue;
    }

    await writeSignal({
      ...scope,
      entityType,
      entityId,
      signalType: "not_interested",
      strength: -1,
      provenance: "user_explicit",
      reason: "Migrated from legacy discovery exclusions"
    }, { now });
    migratedIds.push(entityId);
  }

  if (unresolvedIds.length === 0) {
    storage.setItem(markerKey, fingerprint);
  }

  return {
    status: unresolvedIds.length === 0 ? "complete" : "partial",
    migratedIds,
    unresolvedIds,
    invalidEntryCount: parsed.invalidEntryCount
  };
}

export function buildMigrationMarkerKey(scope: UserSignalScope): string {
  const normalized = normalizeUserSignalScope(scope);
  return [
    MIGRATION_MARKER_PREFIX,
    encodeURIComponent(normalized.ownerAccountId),
    encodeURIComponent(normalized.instanceOrigin)
  ].join(":");
}

function readLegacyExclusions(storage: StorageLike): {
  ids: string[];
  invalidEntryCount: number;
} {
  const raw = storage.getItem(LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY);
  if (!raw) return { ids: [], invalidEntryCount: 0 };
  if (raw.length > MAX_LEGACY_PAYLOAD_BYTES) {
    throw new Error("Legacy discovery controls payload is too large");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error("Legacy discovery controls payload is invalid JSON", { cause });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Legacy discovery controls payload must be an object");
  }

  const exclusions = (parsed as { excludedIds?: unknown }).excludedIds;
  if (exclusions == null) return { ids: [], invalidEntryCount: 0 };
  if (!Array.isArray(exclusions)) {
    throw new Error("Legacy discovery exclusions must be an array");
  }
  if (exclusions.length > MAX_LEGACY_EXCLUSIONS) {
    throw new Error("Legacy discovery exclusions exceed the safe migration limit");
  }

  const ids = new Set<string>();
  let invalidEntryCount = 0;
  for (const value of exclusions) {
    if (typeof value !== "string") {
      invalidEntryCount += 1;
      continue;
    }
    const id = value.trim();
    if (!id || id.length > MAX_ENTITY_ID_LENGTH) {
      invalidEntryCount += 1;
      continue;
    }
    ids.add(id);
  }

  return { ids: [...ids].sort(), invalidEntryCount };
}

function fingerprintIds(ids: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(ids)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1:${ids.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getBrowserStorage(): StorageLike {
  if (typeof localStorage === "undefined") {
    throw new Error("Legacy discovery migration requires browser storage");
  }
  return localStorage;
}
