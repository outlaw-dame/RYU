import { describe, expect, it } from "vitest";
import { buildDiscoveryQueryPlan, splitCamelCase } from "./discovery-query";

describe("splitCamelCase", () => {
  it("splits PascalCase into spaced words", () => {
    expect(splitCamelCase("MitchAlbom")).toBe("Mitch Albom");
    expect(splitCamelCase("WriterWednesday")).toBe("Writer Wednesday");
    expect(splitCamelCase("HarryPotterBooks")).toBe("Harry Potter Books");
  });

  it("handles uppercase acronym blocks", () => {
    expect(splitCamelCase("JRRTolkien")).toBe("JRR Tolkien");
    expect(splitCamelCase("XMLParser")).toBe("XML Parser");
  });

  it("strips leading hash and returns single tokens unchanged", () => {
    expect(splitCamelCase("#MitchAlbom")).toBe("Mitch Albom");
    expect(splitCamelCase("bookstodon")).toBe("bookstodon");
    expect(splitCamelCase("Bookstodon")).toBe("Bookstodon");
  });

  it("returns empty for empty input", () => {
    expect(splitCamelCase("")).toBe("");
  });
});

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

  it("treats #MitchAlbom and Mitch Albom as equivalent via camelCase splits", () => {
    const tagPlan = buildDiscoveryQueryPlan("#MitchAlbom", { maxVariants: 12 });
    const plainPlan = buildDiscoveryQueryPlan("Mitch Albom", { maxVariants: 12 });

    // Hashtag query exposes the spaced plain-text form...
    expect(tagPlan.variants).toContain("mitch albom");
    expect(tagPlan.variants).toContain("#mitchalbom");
    expect(tagPlan.lexicalQuery).toContain("mitch albom");
    expect(tagPlan.lexicalQuery).toContain("#mitchalbom");

    // ...and the plain query exposes the hashtag form.
    expect(plainPlan.variants).toContain("#mitchalbom");
    expect(plainPlan.lexicalQuery).toContain("mitch albom");
  });

  it("splits multi-word PascalCase tokens (HarryPotterBooks, JRRTolkien)", () => {
    const plan = buildDiscoveryQueryPlan("#HarryPotterBooks #JRRTolkien", { maxVariants: 16 });

    expect(plan.variants).toContain("harry potter books");
    expect(plan.variants).toContain("jrr tolkien");
    expect(plan.lexicalQuery).toContain("harry potter books");
    expect(plan.lexicalQuery).toContain("jrr tolkien");
  });

  it("populates lexicalQuery for every plan", () => {
    const plan = buildDiscoveryQueryPlan("Stephen King", { maxVariants: 10 });
    expect(plan.lexicalQuery.length).toBeGreaterThan(0);
    expect(plan.lexicalQuery).toContain("stephen king");
    expect(plan.variants).toContain("#stephen");
  });
});

