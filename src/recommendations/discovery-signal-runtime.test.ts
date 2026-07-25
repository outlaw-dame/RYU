import { describe, expect, it, vi } from "vitest";
import {
  buildUserSignalScopeFromSession,
  loadDiscoveryExclusionIds,
  recordDiscoveryNotInterested
} from "./discovery-signal-runtime";

describe("discovery signal runtime", () => {
  const scope = {
    ownerAccountId: "42",
    instanceOrigin: "https://books.example"
  };

  it("derives scope only from a connected session with immutable account id", () => {
    expect(buildUserSignalScopeFromSession({
      connected: true,
      instanceOrigin: "https://books.example/",
      account: { id: "42" }
    })).toEqual(scope);

    expect(buildUserSignalScopeFromSession({
      connected: true,
      instanceOrigin: "https://books.example",
      account: {}
    })).toBeNull();
  });

  it("runs migration before loading durable explicit exclusions", async () => {
    const order: string[] = [];
    const result = await loadDiscoveryExclusionIds(scope, {
      migrateLegacy: vi.fn(async () => {
        order.push("migrate");
        return { status: "complete", migratedIds: [], unresolvedIds: [], invalidEntryCount: 0 };
      }),
      resolveEntityType: vi.fn(async () => null),
      listSignals: vi.fn(async () => {
        order.push("list");
        return [
          { entityId: "edition-2" },
          { entityId: "edition-1" },
          { entityId: "edition-2" }
        ] as never;
      })
    });

    expect(order).toEqual(["migrate", "list"]);
    expect(result).toEqual(["edition-1", "edition-2"]);
  });

  it("preserves legacy fallback before attempting durable persistence", async () => {
    const order: string[] = [];
    const writeSignal = vi.fn(async () => {
      order.push("durable");
      throw new Error("database unavailable");
    });

    await expect(recordDiscoveryNotInterested(
      { id: "edition-1", entityType: "edition" },
      scope,
      {
        writeLegacyExclusion: vi.fn(() => {
          order.push("legacy");
          return { enabled: true, excludedIds: ["edition-1"], federatedEnabled: false };
        }),
        writeSignal
      }
    )).rejects.toThrow("database unavailable");

    expect(order).toEqual(["legacy", "durable"]);
    expect(writeSignal).toHaveBeenCalledWith(expect.objectContaining({
      ownerAccountId: "42",
      instanceOrigin: "https://books.example",
      entityType: "edition",
      entityId: "edition-1",
      signalType: "not_interested",
      provenance: "user_explicit"
    }));
  });

  it("rejects insecure or incomplete session scope", () => {
    expect(() => buildUserSignalScopeFromSession({
      connected: true,
      instanceOrigin: "http://books.example",
      account: { id: "42" }
    })).toThrow();
  });
});
