import { describe, expect, it } from "vitest";
import { buildDiscoveryQueryPlan } from "./discovery-query";

describe("buildDiscoveryQueryPlan", () => {
  it("keeps hashtag and plain-text variants in sync for configured fediverse tags", () => {
    const plan = buildDiscoveryQueryPlan("#Bookstodon", { maxVariants: 10 });

    expect(plan.normalizedQuery).toBe("#bookstodon");
    expect(plan.variants).toContain("#bookstodon");
    expect(plan.variants).toContain("bookstodon");
  });

  it("matches local entities and contributes alias variants", () => {
    const plan = buildDiscoveryQueryPlan("George Orwell review", { maxVariants: 10 });

    expect(plan.matchedEntities.map((entity) => entity.id)).toContain("entity-george-orwell");
    expect(plan.variants).toContain("george orwell");
    expect(plan.variants).toContain("orwell");
  });

  it("normalizes mixed query terms while preserving explicit hashtags", () => {
    const plan = buildDiscoveryQueryPlan("  WriterWednesday  #BookWyrm  ", { maxVariants: 10 });

    expect(plan.variants).toContain("writerwednesday #bookwyrm");
    expect(plan.variants).toContain("#writerwednesday");
    expect(plan.variants).toContain("writerwednesday");
    expect(plan.variants).toContain("#bookwyrm");
    expect(plan.variants).toContain("bookwyrm");
  });
});
