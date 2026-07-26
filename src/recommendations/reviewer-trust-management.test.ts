import { describe, expect, it, vi } from "vitest";
import {
  createReviewerTrustManager,
  listReviewerTrustOptions,
  reviewerTrustStateDescription,
  reviewerTrustStateLabel
} from "./reviewer-trust-management";
import type { UserSignalScope } from "./user-signal-store";

const scope: UserSignalScope = {
  ownerAccountId: "owner-1",
  instanceOrigin: "https://books.example"
};

describe("reviewer trust management", () => {
  it("loads the persisted state and publishes snapshots", async () => {
    const listener = vi.fn();
    const manager = createReviewerTrustManager(scope, " reviewer-1 ", {
      readState: vi.fn().mockResolvedValue("trusted")
    });
    manager.subscribe(listener);

    const result = await manager.load();

    expect(result).toMatchObject({
      reviewerAccountId: "reviewer-1",
      state: "trusted",
      persistedState: "trusted",
      status: "ready",
      error: null
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "loading" }));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ state: "trusted" }));
  });

  it("freezes the initial snapshot exposed before the first operation", () => {
    const manager = createReviewerTrustManager(scope, "reviewer-initial");
    const initial = manager.getSnapshot();
    const listener = vi.fn();

    manager.subscribe(listener);

    expect(Object.isFrozen(initial)).toBe(true);
    expect(listener).toHaveBeenCalledWith(initial);
    expect(() => {
      (initial as { persistedState: string }).persistedState = "blocked";
    }).toThrow();
    expect(manager.getSnapshot().persistedState).toBe("neutral");
  });

  it("optimistically publishes and rolls back failed writes", async () => {
    let rejectWrite!: (error: Error) => void;
    const writeState = vi.fn(() => new Promise<"blocked">((_, reject) => {
      rejectWrite = reject;
    }));
    const snapshots: string[] = [];
    const manager = createReviewerTrustManager(scope, "reviewer-2", {
      readState: vi.fn().mockResolvedValue("neutral"),
      writeState
    });
    manager.subscribe((snapshot) => snapshots.push(`${snapshot.status}:${snapshot.state}`));
    await manager.load();

    const pending = manager.setState("blocked");
    await Promise.resolve();
    expect(manager.getSnapshot()).toMatchObject({ status: "saving", state: "blocked" });

    rejectWrite(new Error("storage unavailable"));
    const result = await pending;

    expect(result).toMatchObject({
      status: "error",
      state: "neutral",
      persistedState: "neutral"
    });
    expect(result.error?.message).toBe("storage unavailable");
    expect(snapshots).toContain("saving:blocked");
  });

  it("serializes rapid state changes in request order", async () => {
    const writes: string[] = [];
    const writeState = vi.fn(async (_scope, _reviewer, state) => {
      writes.push(state);
      return state;
    });
    const manager = createReviewerTrustManager(scope, "reviewer-3", { writeState });

    await Promise.all([
      manager.setState("trusted"),
      manager.setState("low_trust"),
      manager.setState("neutral")
    ]);

    expect(writes).toEqual(["trusted", "low_trust", "neutral"]);
    expect(manager.getSnapshot()).toMatchObject({
      status: "ready",
      state: "neutral",
      persistedState: "neutral"
    });
  });

  it("ignores stale loads after a newer write begins", async () => {
    let resolveRead!: (state: "trusted") => void;
    const readState = vi.fn(() => new Promise<"trusted">((resolve) => {
      resolveRead = resolve;
    }));
    const manager = createReviewerTrustManager(scope, "reviewer-4", {
      readState,
      writeState: vi.fn().mockResolvedValue("blocked")
    });

    const loading = manager.load();
    await manager.setState("blocked");
    resolveRead("trusted");
    await loading;

    expect(manager.getSnapshot()).toMatchObject({ state: "blocked", persistedState: "blocked" });
  });

  it("waits for an in-flight write before loading persisted state", async () => {
    let resolveWrite!: (state: "trusted") => void;
    let persistedState: "neutral" | "trusted" = "neutral";
    const readState = vi.fn(async () => persistedState);
    const writeState = vi.fn(() => new Promise<"trusted">((resolve) => {
      resolveWrite = (state) => {
        persistedState = state;
        resolve(state);
      };
    }));
    const manager = createReviewerTrustManager(scope, "reviewer-overlap", {
      readState,
      writeState
    });

    const saving = manager.setState("trusted");
    await Promise.resolve();
    const loading = manager.load();

    expect(readState).not.toHaveBeenCalled();
    resolveWrite("trusted");

    await expect(saving).resolves.toMatchObject({
      status: "ready",
      state: "trusted",
      persistedState: "trusted"
    });
    await expect(loading).resolves.toMatchObject({
      status: "ready",
      state: "trusted",
      persistedState: "trusted"
    });
    expect(readState).toHaveBeenCalledTimes(1);
  });

  it("does not notify after disposal and rejects further actions", async () => {
    let resolveRead!: (state: "trusted") => void;
    const manager = createReviewerTrustManager(scope, "reviewer-5", {
      readState: () => new Promise((resolve) => { resolveRead = resolve; })
    });
    const listener = vi.fn();
    manager.subscribe(listener);
    const loading = manager.load();
    manager.dispose();
    resolveRead("trusted");
    await loading;

    expect(listener).toHaveBeenCalledTimes(2);
    await expect(manager.load()).rejects.toThrow("disposed");
    await expect(manager.setState("trusted")).rejects.toThrow("disposed");
  });

  it("rejects invalid reviewer IDs before persistence", () => {
    expect(() => createReviewerTrustManager(scope, " ")).toThrow("required");
    expect(() => createReviewerTrustManager(scope, "x".repeat(2049))).toThrow("too long");
  });

  it("provides complete UI-ready option metadata", () => {
    const options = listReviewerTrustOptions();
    expect(options.map((option) => option.state)).toEqual([
      "trusted",
      "neutral",
      "low_trust",
      "muted",
      "blocked"
    ]);
    expect(options.filter((option) => option.destructive).map((option) => option.state))
      .toEqual(["muted", "blocked"]);
    for (const option of options) {
      expect(option.label).toBe(reviewerTrustStateLabel(option.state));
      expect(option.description).toBe(reviewerTrustStateDescription(option.state));
      expect(option.description.length).toBeGreaterThan(20);
    }
  });
});
