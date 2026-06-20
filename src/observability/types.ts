/**
 * Phase 38 -- Privacy-preserving observability types.
 *
 * Shared type definitions for diagnostic reports, redacted logs,
 * health exports, and privacy levels used across the observability module.
 */

/** Categories of diagnostics data that can be collected. */
export type DiagnosticCategory =
  | 'search'
  | 'sync'
  | 'storage'
  | 'auth'
  | 'network'
  | 'performance'
  | 'moderation';

/** Privacy classification for data fields. */
export type PrivacyLevel =
  | 'public'
  | 'aggregate'
  | 'redacted'
  | 'excluded';

/** Log severity levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single redacted log entry stored in the ring buffer. */
export interface RedactedLog {
  /** Unique entry identifier. */
  id: string;
  /** ISO timestamp of when the entry was created. */
  timestamp: string;
  /** Severity level. */
  level: LogLevel;
  /** Diagnostic category this entry belongs to. */
  category: DiagnosticCategory;
  /** Redacted message with all PII stripped. */
  message: string;
  /** Optional structured metadata (all values already redacted). */
  metadata?: Record<string, unknown>;
}

/** Aggregated health state for a single subsystem. */
export interface SubsystemHealth {
  /** Subsystem identifier. */
  name: string;
  /** Current status. */
  status: 'healthy' | 'degraded' | 'error' | 'unknown';
  /** Last known-good timestamp (ISO). */
  lastHealthyAt: string | null;
  /** Aggregate metrics (counts, durations, ratios -- never content). */
  metrics: Record<string, number>;
}

/** A full health export document safe for sharing. */
export interface HealthExport {
  /** Schema version for forward compatibility. */
  version: number;
  /** ISO timestamp when the export was generated. */
  exportedAt: string;
  /** Per-subsystem health summaries. */
  subsystems: SubsystemHealth[];
  /** Recent redacted log entries (tail of ring buffer). */
  recentLogs: RedactedLog[];
  /** Privacy audit result -- true means the export passed validation. */
  privacyAuditPassed: boolean;
}

/** Full diagnostic report combining all subsystem data. */
export interface DiagnosticReport {
  /** Schema version for forward compatibility. */
  version: number;
  /** ISO timestamp of report generation. */
  generatedAt: string;
  /** Per-subsystem health data. */
  subsystems: SubsystemHealth[];
  /** Recent redacted log entries. */
  recentLogs: RedactedLog[];
  /** Summary performance metrics. */
  performanceSummary: {
    memoryPressure: string;
    renderBudgetExceeded: boolean;
    storageUsageRatio: number | undefined;
  };
  /** Sync queue summary. */
  syncQueueSummary: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  /** Privacy audit result for this report. */
  privacyAuditPassed: boolean;
}
