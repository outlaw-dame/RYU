import { describe, expect, it } from "vitest";
import type { ModelStatus } from "../model-lifecycle";
import type { SearchRuntimeStatus } from "../runtime-status";
import {
  diagnosticErrorCode,
  sanitizeModelStatus,
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
    const sanitized = sanitizeSearchRuntimeStatus({ ...baseStatus, lastFallbackReason: secret, lastError: `Bearer token ${secret}` });
    expect(sanitized.lastFallbackReason).toBe("fallback_applied");
    expect(sanitized.lastError).toBe("runtime_error");
    expect(JSON.stringify(sanitized)).not.toContain(secret);
    expect(Object.isFrozen(sanitized)).toBe(true);
  });

  it("replaces arbitrary model errors with a stable marker", () => {
    const model = {
      id: "minilm",
      state: "failed",
      progress: 0,
      bytesReceived: 0,
      lastChangedAt: "2026-07-26T04:00:00.000Z",
      lastError: "https://models.example/file?token=secret owner-123"
    } as ModelStatus;
    const sanitized = sanitizeModelStatus(model);
    expect(sanitized.lastError).toBe("model_error");
    expect(JSON.stringify(sanitized)).not.toContain("token=secret");
    expect(Object.isFrozen(sanitized)).toBe(true);
  });

  it("does not add error markers when no error state exists", () => {
    const sanitized = sanitizeSearchRuntimeStatus(baseStatus);
    expect(sanitized.lastFallbackReason).toBeUndefined();
    expect(sanitized.lastError).toBeUndefined();
  });

  it("exposes only enumerated diagnostic error codes", () => {
    expect(diagnosticErrorCode("database_initialization_failed")).toBe("database_initialization_failed");
    expect(diagnosticErrorCode("database_unavailable")).toBe("database_unavailable");
    expect(diagnosticErrorCode("index_health_check_failed")).toBe("index_health_check_failed");
  });
});
