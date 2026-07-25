import {
  USER_SIGNAL_ENTITY_TYPES,
  USER_SIGNAL_PROVENANCE,
  USER_SIGNAL_SCHEMA_VERSION,
  USER_SIGNAL_TYPES,
  type UserRecommendationSignalDoc,
  type UserSignalEntityType,
  type UserSignalProvenance,
  type UserSignalType
} from "./user-signal-schema";

const ENTITY_TYPES = new Set<string>(USER_SIGNAL_ENTITY_TYPES);
const SIGNAL_TYPES = new Set<string>(USER_SIGNAL_TYPES);
const PROVENANCE = new Set<string>(USER_SIGNAL_PROVENANCE);
const MAX_ID_LENGTH = 2048;
const MAX_INSTANCE_LENGTH = 512;
const MAX_REASON_LENGTH = 4096;

export type UserSignalInput = Omit<
  UserRecommendationSignalDoc,
  "id" | "createdAt" | "updatedAt" | "schemaVersion"
> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function normalizeInstanceOrigin(input: string): string {
  const parsed = new URL(input.trim());
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("User signal instance origin must use HTTPS");
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("User signal instance origin must be an origin without credentials, path, query, or fragment");
  }
  const origin = parsed.origin.toLowerCase();
  if (origin.length > MAX_INSTANCE_LENGTH) throw new Error("User signal instance origin is too long");
  return origin;
}

export function buildUserSignalId(input: {
  ownerAccountId: string;
  instanceOrigin: string;
  entityType: UserSignalEntityType;
  entityId: string;
  signalType: UserSignalType;
  provenance: UserSignalProvenance;
}): string {
  const parts = [
    "user-signal-v1",
    assertIdentifier(input.ownerAccountId, "owner account ID"),
    normalizeInstanceOrigin(input.instanceOrigin),
    assertEnum(input.entityType, ENTITY_TYPES, "entity type"),
    assertIdentifier(input.entityId, "entity ID"),
    assertEnum(input.signalType, SIGNAL_TYPES, "signal type"),
    assertEnum(input.provenance, PROVENANCE, "signal provenance")
  ];
  return parts.map((part) => encodeURIComponent(part)).join(":");
}

export function createUserSignal(input: UserSignalInput, now = new Date()): UserRecommendationSignalDoc {
  const ownerAccountId = assertIdentifier(input.ownerAccountId, "owner account ID");
  const instanceOrigin = normalizeInstanceOrigin(input.instanceOrigin);
  const entityType = assertEnum(input.entityType, ENTITY_TYPES, "entity type") as UserSignalEntityType;
  const entityId = assertIdentifier(input.entityId, "entity ID");
  const signalType = assertEnum(input.signalType, SIGNAL_TYPES, "signal type") as UserSignalType;
  const provenance = assertEnum(input.provenance, PROVENANCE, "signal provenance") as UserSignalProvenance;
  const strength = normalizeStrength(input.strength);
  const reason = normalizeReason(input.reason);
  const createdAt = normalizeTimestamp(input.createdAt ?? now.toISOString(), "createdAt");
  const updatedAt = normalizeTimestamp(input.updatedAt ?? now.toISOString(), "updatedAt");
  const expiresAt = input.expiresAt ? normalizeTimestamp(input.expiresAt, "expiresAt") : undefined;

  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error("User signal updatedAt cannot precede createdAt");
  }
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(createdAt)) {
    throw new Error("User signal expiresAt must be later than createdAt");
  }

  const canonicalId = buildUserSignalId({
    ownerAccountId,
    instanceOrigin,
    entityType,
    entityId,
    signalType,
    provenance
  });
  if (input.id && input.id !== canonicalId) {
    throw new Error("User signal ID does not match its scoped identity");
  }

  return {
    id: canonicalId,
    ownerAccountId,
    instanceOrigin,
    entityType,
    entityId,
    signalType,
    strength,
    provenance,
    ...(reason ? { reason } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    createdAt,
    updatedAt,
    schemaVersion: USER_SIGNAL_SCHEMA_VERSION
  };
}

export function isUserSignalExpired(signal: UserRecommendationSignalDoc, now = Date.now()): boolean {
  return signal.expiresAt != null && Date.parse(signal.expiresAt) <= now;
}

export function compareUserSignalPrecedence(
  left: UserRecommendationSignalDoc,
  right: UserRecommendationSignalDoc
): number {
  const provenanceDelta = provenanceWeight(left.provenance) - provenanceWeight(right.provenance);
  if (provenanceDelta !== 0) return provenanceDelta;

  const updatedDelta = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;

  return Math.abs(left.strength) - Math.abs(right.strength);
}

export function selectEffectiveUserSignal(
  signals: readonly UserRecommendationSignalDoc[],
  now = Date.now()
): UserRecommendationSignalDoc | null {
  let selected: UserRecommendationSignalDoc | null = null;
  for (const signal of signals) {
    if (isUserSignalExpired(signal, now)) continue;
    if (!selected || compareUserSignalPrecedence(signal, selected) > 0) selected = signal;
  }
  return selected;
}

function provenanceWeight(value: UserSignalProvenance): number {
  switch (value) {
    case "user_explicit": return 3;
    case "imported": return 2;
    case "local_inference": return 1;
  }
}

function assertIdentifier(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`User signal ${label} is required`);
  if (normalized.length > MAX_ID_LENGTH) throw new Error(`User signal ${label} is too long`);
  return normalized;
}

function assertEnum(value: string, allowed: Set<string>, label: string): string {
  if (!allowed.has(value)) throw new Error(`Invalid user signal ${label}`);
  return value;
}

function normalizeStrength(value: number): number {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new Error("User signal strength must be a finite number between -1 and 1");
  }
  return value;
}

function normalizeReason(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_REASON_LENGTH) throw new Error("User signal reason is too long");
  return normalized;
}

function normalizeTimestamp(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid user signal ${label}`);
  return new Date(value).toISOString();
}
