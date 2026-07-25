import { describe, expect, it } from "vitest";
import {
  buildUserSignalId,
  compareUserSignalPrecedence,
  createUserSignal,
  isUserSignalExpired,
  normalizeInstanceOrigin,
  selectEffectiveUserSignal
} from "./user-signals";

const NOW = new Date("2026-07-25T18:00:00.000Z");

function makeSignal(overrides: Partial<Parameters<typeof createUserSignal>[0]> = {}) {
  return createUserSignal({
    ownerAccountId: "owner-1",
    instanceOrigin: "https://books.example",
    entityType: "work",
    entityId: "work-1",
    signalType: "show_less",
    strength: -0.7,
    provenance: "user_explicit",
    ...overrides
  }, NOW);
}

describe("user recommendation signals", () => {
  it("creates a deterministic account- and instance-scoped identity", () => {
    const first = makeSignal();
    const second = makeSignal();
    expect(first.id).toBe(second.id);
    expect(first.id).toBe(buildUserSignalId(first));
    expect(first.instanceOrigin).toBe("https://books.example");
  });

  it("isolates identical entities across owners and instances", () => {
    const base = makeSignal();
    const otherOwner = makeSignal({ ownerAccountId: "owner-2" });
    const otherInstance = makeSignal({ instanceOrigin: "https://other.example" });
    expect(base.id).not.toBe(otherOwner.id);
    expect(base.id).not.toBe(otherInstance.id);
  });

  it("rejects origins with credentials, paths, queries, fragments, or insecure transport", () => {
    expect(() => normalizeInstanceOrigin("http://books.example")).toThrow(/HTTPS/);
    expect(() => normalizeInstanceOrigin("https://user:pass@books.example")).toThrow(/origin/);
    expect(() => normalizeInstanceOrigin("https://books.example/path")).toThrow(/origin/);
    expect(() => normalizeInstanceOrigin("https://books.example?x=1")).toThrow(/origin/);
    expect(() => normalizeInstanceOrigin("https://books.example#x")).toThrow(/origin/);
  });

  it("allows localhost HTTP only for development compatibility", () => {
    expect(normalizeInstanceOrigin("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("rejects invalid strength, timestamps, and mismatched supplied IDs", () => {
    expect(() => makeSignal({ strength: Number.NaN })).toThrow(/strength/);
    expect(() => makeSignal({ strength: 2 })).toThrow(/strength/);
    expect(() => makeSignal({ createdAt: "not-a-date" })).toThrow(/createdAt/);
    expect(() => makeSignal({ createdAt: "2026-07-26T00:00:00Z", updatedAt: "2026-07-25T00:00:00Z" })).toThrow(/precede/);
    expect(() => makeSignal({ expiresAt: "2026-07-25T17:00:00Z" })).toThrow(/later/);
    expect(() => makeSignal({ id: "attacker-controlled-id" })).toThrow(/does not match/);
  });

  it("gives explicit user choices precedence over imported and inferred signals", () => {
    const explicit = makeSignal({ provenance: "user_explicit", strength: -0.2 });
    const imported = makeSignal({ provenance: "imported", strength: 1 });
    const inferred = makeSignal({ provenance: "local_inference", strength: 1 });

    expect(compareUserSignalPrecedence(explicit, imported)).toBeGreaterThan(0);
    expect(compareUserSignalPrecedence(imported, inferred)).toBeGreaterThan(0);
    expect(selectEffectiveUserSignal([inferred, imported, explicit])?.provenance).toBe("user_explicit");
  });

  it("uses the newest signal within the same provenance tier", () => {
    const older = makeSignal({ createdAt: "2026-07-25T16:00:00Z", updatedAt: "2026-07-25T17:00:00Z" });
    const newer = makeSignal({ createdAt: "2026-07-25T16:00:00Z", updatedAt: "2026-07-25T19:00:00Z" });
    expect(selectEffectiveUserSignal([older, newer])?.updatedAt).toBe("2026-07-25T19:00:00.000Z");
  });

  it("ignores expired signals without mutating the source list", () => {
    const expired = makeSignal({ expiresAt: "2026-07-25T18:30:00Z" });
    const active = makeSignal({
      signalType: "show_more",
      strength: 0.5,
      expiresAt: "2026-07-25T20:00:00Z"
    });
    const source = [expired, active] as const;

    expect(isUserSignalExpired(expired, Date.parse("2026-07-25T19:00:00Z"))).toBe(true);
    expect(selectEffectiveUserSignal(source, Date.parse("2026-07-25T19:00:00Z"))?.signalType).toBe("show_more");
    expect(source).toHaveLength(2);
  });

  it("keeps recommendation trust distinct from remote mute/block state", () => {
    const trusted = makeSignal({ entityType: "account", entityId: "reviewer-1", signalType: "trusted", strength: 0.8 });
    expect(trusted.signalType).toBe("trusted");
    expect(trusted.entityType).toBe("account");
    expect(trusted).not.toHaveProperty("muting");
    expect(trusted).not.toHaveProperty("blocking");
  });
});
