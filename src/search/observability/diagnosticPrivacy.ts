import type { ModelStatus } from "../model-lifecycle";
import type { SearchRuntimeStatus } from "../runtime-status";

export type DiagnosticErrorCode =
  | "database_initialization_failed"
  | "database_unavailable"
  | "index_health_check_failed";

export function diagnosticErrorCode(code: DiagnosticErrorCode): DiagnosticErrorCode {
  return code;
}

export function sanitizeSearchRuntimeStatus(status: SearchRuntimeStatus): SearchRuntimeStatus {
  return Object.freeze({
    configuredEmbeddingRuntime: status.configuredEmbeddingRuntime,
    configuredRerankerRuntime: status.configuredRerankerRuntime,
    activeEmbeddingProvider: status.activeEmbeddingProvider,
    activeRerankerProvider: status.activeRerankerProvider,
    deviceTier: status.deviceTier,
    lastAppliedAt: status.lastAppliedAt,
    ...(status.lastFallbackReason ? { lastFallbackReason: "fallback_applied" } : {}),
    ...(status.lastError ? { lastError: "runtime_error" } : {})
  });
}

export function sanitizeModelStatus(status: ModelStatus): ModelStatus {
  return Object.freeze({
    id: status.id,
    state: status.state,
    progress: status.progress,
    bytesReceived: status.bytesReceived,
    lastChangedAt: status.lastChangedAt,
    ...(status.readyRevision ? { readyRevision: status.readyRevision } : {}),
    ...(status.lastError ? { lastError: "model_error" } : {})
  });
}
