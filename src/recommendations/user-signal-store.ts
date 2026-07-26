import { getDatabase } from "../db/client";
import { publishUserSignalInvalidation } from "./user-signal-invalidation";
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

export type UserSignalPersistenceAdapter = {
  upsert(signal: UserRecommendationSignalDoc): Promise<UserRecommendationSignalDoc>;
  list(selector: Readonly<Record<string, string>>): Promise<UserRecommendationSignalDoc[]>;
  get(id: string): Promise<UserRecommendationSignalDoc | null>;
  remove(id: string): Promise<void>;
};

export class UserSignalStoreError extends Error {
  readonly code: "invalid_scope" | "database_failure";

  constructor(code: UserSignalStoreError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UserSignalStoreError";
    this.code = code;
  }
}

export async function upsertUserSignal(
  input: UserSignalInput,
  options: { now?: Date; adapter?: UserSignalPersistenceAdapter } = {}
): Promise<UserRecommendationSignalDoc> {
  const signal = createUserSignal(input, options.now ?? new Date());
  const adapter = options.adapter ?? await createRxDbUserSignalAdapter();

  try {
    const persisted = await adapter.upsert(signal);
    publishUserSignalInvalidation({
      ownerAccountId: persisted.ownerAccountId,
      instanceOrigin: persisted.instanceOrigin
    });
    return persisted;
  } catch (cause) {
    throw databaseFailure("Unable to persist the recommendation preference", cause);
  }
}

export async function listUserSignals(
  query: UserSignalQuery,
  adapter?: UserSignalPersistenceAdapter
): Promise<UserRecommendationSignalDoc[]> {
  const selector = buildUserSignalSelector(query);
  const persistence = adapter ?? await createRxDbUserSignalAdapter();

  try {
    const signals = await persistence.list(selector);
    return signals.filter((signal) => signalMatchesScope(signal, selector));
  } catch (cause) {
    throw databaseFailure("Unable to load recommendation preferences", cause);
  }
}

/**
 * Removes a signal only when it belongs to the supplied local account scope.
 * Missing and foreign-scoped IDs both return false to avoid disclosing whether
 * another signed-in account has a matching local preference.
 */
export async function removeUserSignal(
  id: string,
  scope: UserSignalScope,
  adapter?: UserSignalPersistenceAdapter
): Promise<boolean> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const normalizedId = normalizeRequiredIdentifier(id, "signal ID");
  const persistence = adapter ?? await createRxDbUserSignalAdapter();

  try {
    const signal = await persistence.get(normalizedId);
    if (!signal || !signalMatchesScope(signal, canonicalScope)) return false;
    await persistence.remove(normalizedId);
    publishUserSignalInvalidation(canonicalScope);
    return true;
  } catch (cause) {
    throw databaseFailure("Unable to remove the recommendation preference", cause);
  }
}

/** Removes inferred signals only for one account/instance scope. */
export async function resetInferredUserSignals(
  scope: UserSignalScope,
  adapter?: UserSignalPersistenceAdapter
): Promise<number> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const persistence = adapter ?? await createRxDbUserSignalAdapter();
  const signals = await listUserSignals({ ...canonicalScope, provenance: "local_inference" }, persistence);

  try {
    await Promise.all(signals.map((signal) => persistence.remove(signal.id)));
    if (signals.length > 0) publishUserSignalInvalidation(canonicalScope);
    return signals.length;
  } catch (cause) {
    throw databaseFailure("Unable to reset inferred recommendation preferences", cause);
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

async function createRxDbUserSignalAdapter(): Promise<UserSignalPersistenceAdapter> {
  const db = await getDatabase();
  const collection = db.userrecommendationsignals;

  return {
    async upsert(signal) {
      const document = await collection.incrementalUpsert(signal);
      return document.toJSON() as UserRecommendationSignalDoc;
    },
    async list(selector) {
      const documents = await collection.find({ selector: selector as never }).exec();
      return documents.map((document) => document.toJSON() as UserRecommendationSignalDoc);
    },
    async get(id) {
      const document = await collection.findOne(id).exec();
      return document ? document.toJSON() as UserRecommendationSignalDoc : null;
    },
    async remove(id) {
      const document = await collection.findOne(id).exec();
      if (document) await document.incrementalRemove();
    }
  };
}

function signalMatchesScope(
  signal: UserRecommendationSignalDoc,
  scope: Readonly<Record<string, string>>
): boolean {
  return signal.ownerAccountId === scope.ownerAccountId
    && signal.instanceOrigin === scope.instanceOrigin
    && (!scope.entityType || signal.entityType === scope.entityType)
    && (!scope.entityId || signal.entityId === scope.entityId)
    && (!scope.signalType || signal.signalType === scope.signalType)
    && (!scope.provenance || signal.provenance === scope.provenance);
}

function normalizeRequiredIdentifier(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`User signal ${label} is required`);
  if (normalized.length > 2048) throw new Error(`User signal ${label} is too long`);
  return normalized;
}

function databaseFailure(message: string, cause: unknown): UserSignalStoreError {
  return new UserSignalStoreError("database_failure", message, { cause });
}
