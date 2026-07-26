import { describe, expect, it } from "vitest";
import { collections } from "./schema";

describe("reviewer attribution schema", () => {
  it("adds verified attribution fields without promoting legacy reviews", () => {
    const schema = collections.reviews.schema;

    expect(schema.version).toBe(2);
    expect(schema.required).not.toContain("reviewerAccountId");
    expect(schema.required).not.toContain("reviewerAttributionSource");
    expect(schema.indexes).toContain("reviewerAccountId");
    expect(schema.properties.reviewerAttributionSource).toEqual({
      type: "string",
      enum: ["activitypub_attributed_to"]
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
  });
});
