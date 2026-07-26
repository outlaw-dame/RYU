import { describe, expect, it } from "vitest";
import { createAsyncScopeGuard } from "./async-scope-guard";

describe("createAsyncScopeGuard", () => {
  it("accepts only the newest request in the active scope", () => {
    const guard = createAsyncScopeGuard("account-a");
    const first = guard.begin("account-a");
    const second = guard.begin("account-a");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(guard.isCurrent(first!)).toBe(false);
    expect(guard.isCurrent(second!)).toBe(true);
  });

  it("invalidates every previous token when account scope changes", () => {
    const guard = createAsyncScopeGuard("account-a");
    const previousAccount = guard.begin("account-a");

    expect(guard.isScopeActive("account-a")).toBe(true);
    expect(guard.setScope("account-b")).toBe(true);
    expect(guard.isScopeActive("account-a")).toBe(false);
    expect(guard.isScopeActive("account-b")).toBe(true);
    expect(guard.isCurrent(previousAccount!)).toBe(false);
    expect(guard.begin("account-a")).toBeNull();

    const currentAccount = guard.begin("account-b");
    expect(currentAccount).not.toBeNull();
    expect(guard.isCurrent(currentAccount!)).toBe(true);
  });

  it("invalidates work explicitly and rejects all work after disposal", () => {
    const guard = createAsyncScopeGuard("account-a");
    const token = guard.begin("account-a");

    guard.invalidate();
    expect(guard.isCurrent(token!)).toBe(false);

    const next = guard.begin("account-a");
    expect(next).not.toBeNull();
    guard.dispose();

    expect(guard.isCurrent(next!)).toBe(false);
    expect(guard.isScopeActive("account-a")).toBe(false);
    expect(guard.begin("account-a")).toBeNull();
    expect(guard.setScope("account-b")).toBe(false);
  });

  it("rejects empty and oversized scope keys", () => {
    expect(() => createAsyncScopeGuard("   ")).toThrow("required");
    expect(() => createAsyncScopeGuard("x".repeat(4097))).toThrow("too long");
  });
});
