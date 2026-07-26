import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./runtime-schema-version";
import { collections } from "./schema";

describe("reviewer attribution schema", () => {
  it("advances the schema and adds attribution without promoting legacy reviews", () => {
    const schema = collections.reviews.schema;

    expect(CURRENT_SCHEMA_VERSION).toBe(3);
    expect(schema.version).toBe(3);
    expect(schema.required).not.toContain("reviewerAccountId");
    expect(schema.required).not.toContain("reviewerAttributionSource");
    expect(schema.indexes).not.toContain("reviewerAccountId");
    expect(schema.properties.reviewerAttributionSource).toEqual({
      type: "string",
      enum: ["authenticated_activitypub_actor"]
    });
  });

  it("provides pass-through migrations for existing review documents", () => {
    const legacy = Object.freeze({
      id: "review-1",
      content: "A review",
      editionId: "edition-1",
      accountId: "legacy-account",
      published: "2026-07-25T00:00:00.000Z",
      importedAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z"
    });

    expect(collections.reviews.migrationStrategies[2](legacy)).toBe(legacy);
    expect(collections.reviews.migrationStrategies[3](legacy)).toBe(legacy);
  });
});
