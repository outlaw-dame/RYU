import { describe, expect, it } from "vitest";
import { collections, CURRENT_SCHEMA_VERSION } from "../db/runtime-schema";
import {
  USER_SIGNAL_ENTITY_TYPES,
  USER_SIGNAL_PROVENANCE,
  USER_SIGNAL_TYPES
} from "./user-signal-schema";

type SignalSchema = {
  version: number;
  required: readonly string[];
  indexes: readonly string[];
  additionalProperties: boolean;
  properties: {
    entityType: { enum: readonly string[] };
    signalType: { enum: readonly string[] };
    provenance: { enum: readonly string[] };
    strength: { minimum: number; maximum: number };
  };
};

function getSignalSchema(): SignalSchema {
  return collections.userrecommendationsignals.schema as unknown as SignalSchema;
}

describe("user recommendation signal RxDB schema", () => {
  it("is registered at the current runtime schema version", () => {
    expect(getSignalSchema().version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("requires account and instance scope on every document", () => {
    expect(getSignalSchema().required).toEqual(expect.arrayContaining([
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
    ]));
  });

  it("indexes account scope and recommendation lookup dimensions", () => {
    expect(getSignalSchema().indexes).toEqual(expect.arrayContaining([
      "ownerAccountId",
      "instanceOrigin",
      "entityType",
      "entityId",
      "signalType",
      "provenance",
      "updatedAt",
      "expiresAt"
    ]));
  });

  it("uses the canonical entity, signal, and provenance enumerations", () => {
    const properties = getSignalSchema().properties;
    expect(properties.entityType.enum).toEqual([...USER_SIGNAL_ENTITY_TYPES]);
    expect(properties.signalType.enum).toEqual([...USER_SIGNAL_TYPES]);
    expect(properties.provenance.enum).toEqual([...USER_SIGNAL_PROVENANCE]);
  });

  it("rejects undeclared properties and bounds signal strength", () => {
    const schema = getSignalSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.strength).toMatchObject({ minimum: -1, maximum: 1 });
  });
});
