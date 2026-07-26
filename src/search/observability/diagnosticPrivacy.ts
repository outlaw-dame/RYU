import type { SearchRuntimeStatus } from "../runtime-status";

export type DiagnosticErrorCode =
  | "database_initialization_failed"
  | "database_unavailable"
  | "index_health_check_failed";

/**
 * Diagnostics are user-exportable. Never forward arbitrary exception text,
 * query text, entity identifiers, account data, or local preference values.
 */
export function diagnosticErrorCode(code: DiagnosticErrorCode): DiagnosticErrorCode {
  return code;
}

/**
 * Preserve operational enums and capability state while replacing arbitrary
 * runtime strings with stable, non-sensitive markers.
 */
export function sanitizeSearchRuntimeStatus(
  status: SearchRuntimeStatus
): SearchRuntimeStatus {
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
