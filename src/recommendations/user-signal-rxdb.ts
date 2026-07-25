import { CURRENT_SCHEMA_VERSION } from "../db/runtime-schema-version";
import {
  USER_SIGNAL_ENTITY_TYPES,
  USER_SIGNAL_PROVENANCE,
  USER_SIGNAL_TYPES,
  type UserRecommendationSignalDoc
} from "./user-signal-schema";

const id = { type: "string", minLength: 1, maxLength: 2048 } as const;
const scopedId = { type: "string", minLength: 1, maxLength: 2048 } as const;
const origin = { type: "string", minLength: 8, maxLength: 512 } as const;
const timestamp = { type: "string", minLength: 20, maxLength: 40 } as const;

function passThrough(doc: unknown): unknown {
  return doc;
}

/**
 * Durable, local-first persistence contract for explicit and inferred
 * recommendation/trust signals. Every document is scoped to the authenticated
 * local owner and instance. Runtime creation still goes through
 * createUserSignal(), which performs stronger semantic validation than JSON
 * schema alone can express.
 */
export const userRecommendationSignalsCollection = {
  schema: {
    title: "user recommendation signals schema",
    version: CURRENT_SCHEMA_VERSION,
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
      ownerAccountId: scopedId,
      instanceOrigin: origin,
      entityType: { type: "string", enum: [...USER_SIGNAL_ENTITY_TYPES] },
      entityId: scopedId,
      signalType: { type: "string", enum: [...USER_SIGNAL_TYPES] },
      strength: { type: "number", minimum: -1, maximum: 1 },
      provenance: { type: "string", enum: [...USER_SIGNAL_PROVENANCE] },
      reason: { type: "string", maxLength: 4096 },
      expiresAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: { type: "number", minimum: 1, maximum: 1 }
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
    1: passThrough,
    [CURRENT_SCHEMA_VERSION]: passThrough
  }
} as const;

export type UserRecommendationSignalCollectionDocument = UserRecommendationSignalDoc;
