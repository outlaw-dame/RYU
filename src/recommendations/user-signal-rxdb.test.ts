import { describe, expect, it } from "vitest";
import { collections, CURRENT_SCHEMA_VERSION } from "../db/runtime-schema";
import {
  USER_SIGNAL_ENTITY_TYPES,
  USER_SIGNAL_PROVENANCE,
  USER_SIGNAL_TYPES
} from "./user-signal-schema";

const collection = collections.userrecommendationsignals;

describe("user recommendation signal RxDB schema", () => {
  it("uses the current runtime version and a strict primary key", () => {
    const schema = collection.schema;
    expect(schema.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(schema.primaryKey).toBe("id");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("ownerAccountId");
    expect(schema.required).toContain("instanceOrigin");
    expect(schema.required).toContain("schemaVersion");
  });

  it("keeps supported enums aligned with the domain model", () => {
    const properties = collection.schema.properties;
    expect(properties.entityType.enum).toEqual(USER_SIGNAL_ENTITY_TYPES);
    expect(properties.signalType.enum).toEqual(USER_SIGNAL_TYPES);
    expect(properties.provenance.enum).toEqual(USER_SIGNAL_PROVENANCE);
  });

  it("bounds strength and uses owner-scoped compound indexes", () => {
    const schema = collection.schema;
    expect(schema.properties.strength.minimum).toBe(-1);
    expect(schema.properties.strength.maximum).toBe(1);
    expect(schema.indexes).toEqual(expect.arrayContaining([
      ["ownerAccountId", "instanceOrigin"],
      ["ownerAccountId", "instanceOrigin", "entityType", "entityId"],
      ["ownerAccountId", "instanceOrigin", "signalType"],
      ["ownerAccountId", "instanceOrigin", "provenance"],
      "updatedAt"
    ]));
  });

  it("provides migration strategies through the current version", () => {
    expect(collection.migrationStrategies[1]).toBeTypeOf("function");
    expect(collection.migrationStrategies[CURRENT_SCHEMA_VERSION]).toBeTypeOf("function");
  });
});
