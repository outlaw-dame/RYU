import { describe, it, expect } from "vitest";
import {
  MAX_ATTEMPTS_BY_PRIORITY,
  embeddingJobKey,
  nextRetryDelayMs
} from "../embeddingJobTypes";

describe("embeddingJobTypes", () => {
  describe("embeddingJobKey", () => {
    it("composes a stable key from entity, provider, and textHash", () => {
      expect(embeddingJobKey("a", "minilm", "h1")).toBe("a::minilm::h1");
    });

    it("differs between providers", () => {
      const k1 = embeddingJobKey("a", "minilm", "h1");
      const k2 = embeddingJobKey("a", "deterministic", "h1");
      expect(k1).not.toBe(k2);
    });

    it("differs between textHashes", () => {
      const k1 = embeddingJobKey("a", "minilm", "h1");
      const k2 = embeddingJobKey("a", "minilm", "h2");
      expect(k1).not.toBe(k2);
    });
  });

  describe("MAX_ATTEMPTS_BY_PRIORITY", () => {
    it("gives user-visible jobs 3 attempts", () => {
      expect(MAX_ATTEMPTS_BY_PRIORITY["user-visible"]).toBe(3);
    });

    it("gives idle jobs 3 attempts", () => {
      expect(MAX_ATTEMPTS_BY_PRIORITY["idle"]).toBe(3);
    });

    it("gives repair and backfill jobs higher retry budgets", () => {
      expect(MAX_ATTEMPTS_BY_PRIORITY["repair"]).toBeGreaterThanOrEqual(5);
      expect(MAX_ATTEMPTS_BY_PRIORITY["backfill"]).toBeGreaterThanOrEqual(5);
    });
  });

  describe("nextRetryDelayMs", () => {
    it("returns a positive delay for attempt 1", () => {
      expect(nextRetryDelayMs(1)).toBeGreaterThan(0);
    });

    it("grows with attempt number", () => {
      // Use an averaged sample to mitigate jitter randomness
      const samples = (attempt: number) => {
        let sum = 0;
        for (let i = 0; i < 32; i++) sum += nextRetryDelayMs(attempt);
        return sum / 32;
      };

      const a1 = samples(1);
      const a3 = samples(3);

      expect(a3).toBeGreaterThan(a1);
    });

    it("caps the base delay at 30s", () => {
      // attempt 100 would otherwise overflow; should be capped
      const delay = nextRetryDelayMs(100);
      expect(delay).toBeLessThanOrEqual(30_000 + 250);
    });

    it("clamps negative attempts to 0", () => {
      const delay = nextRetryDelayMs(-5);
      // attempt 0 -> base = min(30000, 500) = 500, plus jitter <= 250
      expect(delay).toBeLessThanOrEqual(750);
      expect(delay).toBeGreaterThanOrEqual(500);
    });
  });
});
