import { describe, expect, it, vi } from "vitest";
import {
  buildMigrationMarkerKey,
  LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY,
  migrateLegacyDiscoveryExclusions
} from "./legacy-discovery-migration";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import { createUserSignal } from "./user-signals";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values
  };
}

const scope = {
  ownerAccountId: "owner-1",
  instanceOrigin: "https://books.example"
};

function createWriter(target: UserRecommendationSignalDoc[]) {
  return vi.fn(async (input, options) => {
    const signal = createUserSignal(input, options?.now ?? new Date());
    const index = target.findIndex((candidate) => candidate.id === signal.id);
    if (index >= 0) target[index] = signal;
    else target.push(signal);
    return signal;
  });
}

describe("legacy discovery migration", () => {
  it("returns no_data when no legacy preferences exist", async () => {
    const storage = createStorage();
    const writeSignal = createWriter([]);

    await expect(migrateLegacyDiscoveryExclusions({
      scope,
      storage,
      resolveEntityType: () => "edition",
      writeSignal
    })).resolves.toMatchObject({ status: "no_data", migratedIds: [] });
    expect(writeSignal).not.toHaveBeenCalled();
  });

  it("migrates only resolved IDs and retains the legacy source", async () => {
    const legacy = JSON.stringify({
      enabled: true,
      excludedIds: [" edition-1 ", "author-1", "unknown-1", "edition-1", 42],
      federatedEnabled: false
    });
    const storage = createStorage({ [LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY]: legacy });
    const records: UserRecommendationSignalDoc[] = [];
    const writeSignal = createWriter(records);

    const result = await migrateLegacyDiscoveryExclusions({
      scope,
      storage,
      now: new Date("2026-07-25T21:00:00.000Z"),
      resolveEntityType: (id) => {
        if (id.startsWith("edition")) return "edition";
        if (id.startsWith("author")) return "author";
        return null;
      },
      writeSignal
    });

    expect(result).toEqual({
      status: "partial",
      migratedIds: ["author-1", "edition-1"],
      unresolvedIds: ["unknown-1"],
      invalidEntryCount: 1
    });
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.provenance === "user_explicit")).toBe(true);
    expect(records.every((record) => record.signalType === "not_interested")).toBe(true);
    expect(storage.getItem(LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY)).toBe(legacy);
    expect(storage.getItem(buildMigrationMarkerKey(scope))).toBeNull();
  });

  it("writes a scoped completion marker only after all entries persist", async () => {
    const legacy = JSON.stringify({ excludedIds: ["edition-1", "author-1"] });
    const storage = createStorage({ [LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY]: legacy });
    const records: UserRecommendationSignalDoc[] = [];
    const writeSignal = createWriter(records);

    const first = await migrateLegacyDiscoveryExclusions({
      scope,
      storage,
      resolveEntityType: (id) => id.startsWith("author") ? "author" : "edition",
      writeSignal
    });
    const second = await migrateLegacyDiscoveryExclusions({
      scope,
      storage,
      resolveEntityType: () => "edition",
      writeSignal
    });

    expect(first.status).toBe("complete");
    expect(second.status).toBe("already_complete");
    expect(records).toHaveLength(2);
    expect(writeSignal).toHaveBeenCalledTimes(2);
    expect(storage.getItem(LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY)).toBe(legacy);
  });

  it("does not mark completion when persistence fails", async () => {
    const legacy = JSON.stringify({ excludedIds: ["edition-1"] });
    const storage = createStorage({ [LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY]: legacy });
    const writeSignal = vi.fn(async () => {
      throw new Error("database unavailable");
    });

    await expect(migrateLegacyDiscoveryExclusions({
      scope,
      storage,
      resolveEntityType: () => "edition",
      writeSignal
    })).rejects.toThrow("database unavailable");
    expect(storage.getItem(buildMigrationMarkerKey(scope))).toBeNull();
    expect(storage.getItem(LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY)).toBe(legacy);
  });

  it("isolates migration markers by local account and instance", () => {
    expect(buildMigrationMarkerKey(scope)).not.toBe(buildMigrationMarkerKey({
      ...scope,
      ownerAccountId: "owner-2"
    }));
    expect(buildMigrationMarkerKey(scope)).not.toBe(buildMigrationMarkerKey({
      ...scope,
      instanceOrigin: "https://other.example"
    }));
  });

  it("rejects oversized or structurally invalid legacy payloads", async () => {
    const nonArray = createStorage({
      [LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY]: JSON.stringify({ excludedIds: "edition-1" })
    });
    await expect(migrateLegacyDiscoveryExclusions({
      scope,
      storage: nonArray,
      resolveEntityType: () => "edition"
    })).rejects.toThrow(/array/);

    const oversized = createStorage({
      [LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY]: "x".repeat(1_000_001)
    });
    await expect(migrateLegacyDiscoveryExclusions({
      scope,
      storage: oversized,
      resolveEntityType: () => "edition"
    })).rejects.toThrow(/too large/);
  });
});
