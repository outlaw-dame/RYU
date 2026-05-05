import { describe, expect, it } from "bun:test";

describe("Bun test runner", () => {
  it("is scoped away from Vitest and Playwright suites", async () => {
    const packageJson = await Bun.file("package.json").json() as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.test).toContain("vitest run");
    expect(packageJson.scripts?.["test:e2e"]).toContain("playwright test");
  });
});
