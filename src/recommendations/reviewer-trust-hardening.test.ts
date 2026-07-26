import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeReviewerTrustContribution,
  getReviewerTrustLevel,
  setReviewerTrust
} from "./reviewer-trust-store";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

describe("reviewer trust hardening", () => {
  it("isolates identical server-local reviewer IDs by authenticated owner instance", () => {
    const firstOwner = "https://books-one.example#7";
    const secondOwner = "https://books-two.example#7";

    setReviewerTrust("42", "trusted", { ownerAccountId: firstOwner });
    setReviewerTrust("42", "blocked", { ownerAccountId: secondOwner });

    expect(getReviewerTrustLevel("42", firstOwner)).toBe("trusted");
    expect(getReviewerTrustLevel("42", secondOwner)).toBe("blocked");
  });

  it("normalizes non-finite confidence to a bounded finite contribution", () => {
    const owner = "https://books.example#7";
    setReviewerTrust("42", "trusted", { ownerAccountId: owner });

    const result = computeReviewerTrustContribution("42", Number.NaN, owner);

    expect(Number.isFinite(result.delta)).toBe(true);
    expect(result.delta).toBeCloseTo(0.15, 5);
    expect(result.exclude).toBe(false);
  });
});
