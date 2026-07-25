import {
  USER_SIGNAL_ENTITY_TYPES,
  USER_SIGNAL_PROVENANCE,
  USER_SIGNAL_SCHEMA_VERSION,
  USER_SIGNAL_TYPES
} from "./user-signal-schema";

const id = { type: "string", minLength: 1, maxLength: 2048 } as const;
const origin = { type: "string", minLength: 8, maxLength: 512 } as const;
const timestamp = { type: "string", minLength: 20, maxLength: 40 } as const;

function passThrough(doc: unknown): unknown {
  return doc;
}

/**
 * Base collection contract. runtime-schema.ts upgrades every collection to the
 * current database schema version through one canonical migration path.
 */
export const userRecommendationSignalsCollection = {
  schema: {
    title: "user recommendation signals schema",
    version: 1,
    type: "object",
    primaryKey: "id",
    additionalProperties: false,
    indexes: [
      "ownerAccountId",
      "instanceOrigin",
      "entityType",
      "entityId",
      "signalType",
      "provenance",
      "updatedAt",
      "expiresAt"
    ],
    properties: {
      id,
      ownerAccountId: id,
      instanceOrigin: origin,
      entityType: { type: "string", enum: [...USER_SIGNAL_ENTITY_TYPES] },
      entityId: id,
      signalType: { type: "string", enum: [...USER_SIGNAL_TYPES] },
      strength: { type: "number", minimum: -1, maximum: 1 },
      provenance: { type: "string", enum: [...USER_SIGNAL_PROVENANCE] },
      reason: { type: "string", maxLength: 4096 },
      expiresAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: {
        type: "number",
        minimum: USER_SIGNAL_SCHEMA_VERSION,
        maximum: USER_SIGNAL_SCHEMA_VERSION
      }
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
    1: passThrough
  }
} as const;
