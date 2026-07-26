import { describe, expect, it } from "vitest";
import type { SearchRuntimeStatus } from "../runtime-status";
import {
  diagnosticErrorCode,
  sanitizeSearchRuntimeStatus
} from "./diagnosticPrivacy";

const baseStatus: SearchRuntimeStatus = {
  configuredEmbeddingRuntime: "auto",
  configuredRerankerRuntime: "off",
  activeEmbeddingProvider: "deterministic",
  activeRerankerProvider: "off",
  deviceTier: "standard",
  lastAppliedAt: "2026-07-26T04:00:00.000Z"
};

describe("diagnostics privacy boundary", () => {
  it("replaces arbitrary runtime strings with stable markers", () => {
    const secret = "owner-123 trusted reviewer alice@example.com query=dune";
    const sanitized = sanitizeSearchRuntimeStatus({
      ...baseStatus,
      lastFallbackReason: secret,
      lastError: `Bearer token ${secret}`
    });

    expect(sanitized.lastFallbackReason).toBe("fallback_applied");
    expect(sanitized.lastError).toBe("runtime_error");
    expect(JSON.stringify(sanitized)).not.toContain(secret);
    expect(JSON.stringify(sanitized)).not.toContain("alice@example.com");
    expect(Object.isFrozen(sanitized)).toBe(true);
  });

  it("does not add error markers when no error state exists", () => {
    const sanitized = sanitizeSearchRuntimeStatus(baseStatus);
    expect(sanitized.lastFallbackReason).toBeUndefined();
    expect(sanitized.lastError).toBeUndefined();
  });

  it("exposes only enumerated diagnostic error codes", () => {
    expect(diagnosticErrorCode("database_initialization_failed"))
      .toBe("database_initialization_failed");
    expect(diagnosticErrorCode("database_unavailable"))
      .toBe("database_unavailable");
    expect(diagnosticErrorCode("index_health_check_failed"))
      .toBe("index_health_check_failed");
  });
});
