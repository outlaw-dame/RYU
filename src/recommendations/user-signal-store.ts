import type { RxDocument } from "rxdb";
import { getDatabase, type RyuDatabase } from "../db/client";
import type {
  UserRecommendationSignalDoc,
  UserSignalEntityType,
  UserSignalProvenance,
  UserSignalType
} from "./user-signal-schema";
import {
  createUserSignal,
  normalizeInstanceOrigin,
  type UserSignalInput
} from "./user-signals";

export type UserSignalScope = {
  ownerAccountId: string;
  instanceOrigin: string;
};

export type UserSignalQuery = UserSignalScope & {
  entityType?: UserSignalEntityType;
  entityId?: string;
  signalType?: UserSignalType;
  provenance?: UserSignalProvenance;
};

export class UserSignalStoreError extends Error {
  readonly code: "invalid_scope" | "database_failure";

  constructor(code: UserSignalStoreError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UserSignalStoreError";
    this.code = code;
  }
}

type UserSignalDocument = RxDocument<UserRecommendationSignalDoc>;
type UserSignalCollection = RyuDatabase["userrecommendationsignals"];

export async function upsertUserSignal(
  input: UserSignalInput,
  now = new Date(),
  database?: RyuDatabase
): Promise<UserRecommendationSignalDoc> {
  const signal = createUserSignal(input, now);
  const collection = await getCollection(database);

  try {
    const document = await collection.incrementalUpsert(signal);
    return document.toJSON() as UserRecommendationSignalDoc;
  } catch (cause) {
    throw new UserSignalStoreError(
      "database_failure",
      "Unable to persist the recommendation preference",
      { cause }
    );
  }
}

export async function listUserSignals(
  query: UserSignalQuery,
  database?: RyuDatabase
): Promise<UserRecommendationSignalDoc[]> {
  const selector = buildUserSignalSelector(query);
  const collection = await getCollection(database);

  try {
    const documents = await collection.find({ selector }).exec();
    return documents.map((document) => document.toJSON() as UserRecommendationSignalDoc);
  } catch (cause) {
    throw new UserSignalStoreError(
      "database_failure",
      "Unable to load recommendation preferences",
      { cause }
    );
  }
}

/**
 * Removes a signal only when it belongs to the supplied local account scope.
 * A missing or foreign-scoped ID returns false without revealing which case
 * occurred, preventing accidental cross-account deletion and local IDOR-like
 * behavior during account switching.
 */
export async function removeUserSignal(
  id: string,
  scope: UserSignalScope,
  database?: RyuDatabase
): Promise<boolean> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const normalizedId = normalizeRequiredIdentifier(id, "signal ID");
  const collection = await getCollection(database);

  try {
    const document = await collection.findOne(normalizedId).exec();
    if (!document || !documentMatchesScope(document, canonicalScope)) return false;
    await document.incrementalRemove();
    return true;
  } catch (cause) {
    throw new UserSignalStoreError(
      "database_failure",
      "Unable to remove the recommendation preference",
      { cause }
    );
  }
}

/** Removes only inferred signals for one account/instance scope. */
export async function resetInferredUserSignals(
  scope: UserSignalScope,
  database?: RyuDatabase
): Promise<number> {
  const selector = buildUserSignalSelector({
    ...scope,
    provenance: "local_inference"
  });
  const collection = await getCollection(database);

  try {
    const documents = await collection.find({ selector }).exec();
    await Promise.all(documents.map((document) => document.incrementalRemove()));
    return documents.length;
  } catch (cause) {
    throw new UserSignalStoreError(
      "database_failure",
      "Unable to reset inferred recommendation preferences",
      { cause }
    );
  }
}

export function buildUserSignalSelector(query: UserSignalQuery): Record<string, string> {
  const scope = normalizeUserSignalScope(query);
  const selector: Record<string, string> = {
    ownerAccountId: scope.ownerAccountId,
    instanceOrigin: scope.instanceOrigin
  };

  if (query.entityType) selector.entityType = query.entityType;
  if (query.entityId) selector.entityId = normalizeRequiredIdentifier(query.entityId, "entity ID");
  if (query.signalType) selector.signalType = query.signalType;
  if (query.provenance) selector.provenance = query.provenance;

  return selector;
}

export function normalizeUserSignalScope(scope: UserSignalScope): UserSignalScope {
  try {
    return {
      ownerAccountId: normalizeRequiredIdentifier(scope.ownerAccountId, "owner account ID"),
      instanceOrigin: normalizeInstanceOrigin(scope.instanceOrigin)
    };
  } catch (cause) {
    throw new UserSignalStoreError(
      "invalid_scope",
      "Invalid recommendation preference account scope",
      { cause }
    );
  }
}

async function getCollection(database?: RyuDatabase): Promise<UserSignalCollection> {
  const db = database ?? await getDatabase();
  return db.userrecommendationsignals;
}

function documentMatchesScope(
  document: UserSignalDocument,
  scope: UserSignalScope
): boolean {
  return document.ownerAccountId === scope.ownerAccountId
    && document.instanceOrigin === scope.instanceOrigin;
}

function normalizeRequiredIdentifier(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`User signal ${label} is required`);
  if (normalized.length > 2048) throw new Error(`User signal ${label} is too long`);
  return normalized;
}
