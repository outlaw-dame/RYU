import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  initializeDatabase: vi.fn()
}));

import { initializeDatabase } from "../db/client";
import { buildSearchQueryExpansionPlan } from "./query-expansion";

describe("buildSearchQueryExpansionPlan", () => {
  it("includes hashtag/plain-text variants from discovery plan", async () => {
    vi.mocked(initializeDatabase).mockResolvedValue(mockDatabase([]) as never);

    const plan = await buildSearchQueryExpansionPlan("#Bookstodon");

    expect(plan.normalizedQuery).toBe("#bookstodon");
    expect(plan.variants).toContain("#bookstodon");
    expect(plan.variants).toContain("bookstodon");
    expect(plan.semanticQuery).toContain("bookstodon");
  });

  it("adds DBpedia/Wikidata/OpenLibrary/GoogleBooks label variants when query overlaps", async () => {
    vi.mocked(initializeDatabase).mockResolvedValue(mockDatabase([
      {
        label: "George Orwell",
        description: "English novelist",
        query: "george orwell",
        externalUri: "https://www.wikidata.org/entity/Q208735"
      },
      {
        label: "Nineteen Eighty-Four",
        description: "Dystopian novel",
        query: "orwell 1984",
        externalUri: "https://openlibrary.org/works/OL7343626W"
      }
    ]) as never);

    const plan = await buildSearchQueryExpansionPlan("orwell");

    expect(plan.variants).toContain("george orwell");
    expect(plan.variants).toContain("nineteen eighty-four");
  });
});

function mockDatabase(entityLinks: Array<{ label?: string; description?: string; query: string; externalUri: string }>) {
  return {
    entitylinks: {
      find: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue(entityLinks)
      }))
    }
  };
}
