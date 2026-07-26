export const USER_SIGNAL_SCHEMA_VERSION = 1;

export const USER_SIGNAL_ENTITY_TYPES = [
  "author",
  "work",
  "edition",
  "series",
  "publisher",
  "genre",
  "tag",
  "trope",
  "account",
  "domain",
  "instance",
  "source"
] as const;

export const USER_SIGNAL_TYPES = [
  "show_more",
  "show_less",
  "not_interested",
  "suppress",
  "prefer",
  "trusted",
  "low_trust",
  "reviewer_muted",
  "reviewer_blocked"
] as const;

export const USER_SIGNAL_PROVENANCE = [
  "user_explicit",
  "local_inference",
  "imported"
] as const;

export type UserSignalEntityType = (typeof USER_SIGNAL_ENTITY_TYPES)[number];
export type UserSignalType = (typeof USER_SIGNAL_TYPES)[number];
export type UserSignalProvenance = (typeof USER_SIGNAL_PROVENANCE)[number];

export type UserRecommendationSignalDoc = {
  id: string;
  ownerAccountId: string;
  instanceOrigin: string;
  entityType: UserSignalEntityType;
  entityId: string;
  signalType: UserSignalType;
  strength: number;
  provenance: UserSignalProvenance;
  reason?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
};

const id = { type: "string", minLength: 1, maxLength: 2048 } as const;
const shortText = { type: "string", minLength: 1, maxLength: 512 } as const;
const optionalText = { type: "string", maxLength: 4096 } as const;
const timestamp = { type: "string", minLength: 20, maxLength: 40 } as const;

export const userRecommendationSignalsCollection = {
  schema: {
    title: "user recommendation signals schema",
    version: USER_SIGNAL_SCHEMA_VERSION,
    type: "object",
    primaryKey: "id",
    additionalProperties: false,
    indexes: [
      ["ownerAccountId", "instanceOrigin"],
      ["ownerAccountId", "instanceOrigin", "entityType", "entityId"],
      ["ownerAccountId", "instanceOrigin", "signalType"],
      ["ownerAccountId", "instanceOrigin", "provenance"],
      "expiresAt",
      "updatedAt"
    ],
    properties: {
      id,
      ownerAccountId: id,
      instanceOrigin: shortText,
      entityType: { type: "string", enum: USER_SIGNAL_ENTITY_TYPES },
      entityId: id,
      signalType: { type: "string", enum: USER_SIGNAL_TYPES },
      strength: { type: "number", minimum: -1, maximum: 1 },
      provenance: { type: "string", enum: USER_SIGNAL_PROVENANCE },
      reason: optionalText,
      expiresAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: { type: "number", minimum: USER_SIGNAL_SCHEMA_VERSION, maximum: USER_SIGNAL_SCHEMA_VERSION }
    },
    required: [
      "id",
      "ownerAccountId",
      "instanceOrigin",
      "entityType",
      "entityId",
      "signalType",
      "strength",
      "provenance",
      "createdAt",
      "updatedAt",
      "schemaVersion"
    ]
  },
  migrationStrategies: {
    1: (document: UserRecommendationSignalDoc): UserRecommendationSignalDoc => ({
      ...document,
      schemaVersion: USER_SIGNAL_SCHEMA_VERSION
    })
  }
} as const;
