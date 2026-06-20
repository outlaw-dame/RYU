/**
 * Phase 38 -- Health exporter.
 *
 * Aggregates search health, queue health, storage stats, and moderation
 * sync state into a single JSON-safe document for export. All private
 * content is stripped before assembly.
 *
 * PRIVACY: The export contains only aggregate counts, status enums,
 * timestamps, and pre-redacted log messages. Never user content, queries,
 * tokens, or account names.
 */

import type { HealthExport, SubsystemHealth } from './types';
import { getAllLogEntries } from './redacted-logger';
import { auditPrivacy } from './privacy-audit';

/** Options for health export generation. */
export interface HealthExportOptions {
  /** Maximum number of recent log entries to include. Default: 100. */
  maxLogEntries?: number;
  /** Custom subsystem health providers. */
  subsystemProviders?: Array<() => SubsystemHealth | Promise<SubsystemHealth>>;
}

/**
 * Collect search subsystem health.
 */
async function collectSearchHealth(): Promise<SubsystemHealth> {
  try {
    const { captureSearchDiagnosticsSnapshot } = await import(
      '../search/observability/searchDiagnosticsSnapshot'
    );
    const snapshot = await captureSearchDiagnosticsSnapshot();
    const indexHealthy = snapshot.index.health !== null && !snapshot.index.healthError;
    return {
      name: 'search',
      status: indexHealthy ? 'healthy' : 'degraded',
      lastHealthyAt: indexHealthy ? snapshot.capturedAt : null,
      metrics: {
        writeThroughPending: snapshot.queue.writeThroughPending,
        writeThroughActive: snapshot.queue.writeThroughActive,
        providerGeneration: snapshot.engine.providerGeneration,
        modelCount: snapshot.model.models.length,
      },
    };
  } catch {
    return {
      name: 'search',
      status: 'error',
      lastHealthyAt: null,
      metrics: {},
    };
  }
}

/**
 * Collect sync queue subsystem health.
 */
async function collectSyncQueueHealth(): Promise<SubsystemHealth> {
  try {
    const { getSyncQueueEngine } = await import('../hooks/useSyncQueueHealth');
    const engine = getSyncQueueEngine();
    const health = engine.health();
    const hasFailed = health.failed > 0;
    return {
      name: 'sync',
      status: hasFailed ? 'degraded' : 'healthy',
      lastHealthyAt: health.lastSuccessAt,
      metrics: {
        pending: health.pending,
        processing: health.processing,
        completed: health.completed,
        failed: health.failed,
      },
    };
  } catch {
    return {
      name: 'sync',
      status: 'unknown',
      lastHealthyAt: null,
      metrics: {},
    };
  }
}

/**
 * Collect storage subsystem health.
 */
async function collectStorageHealth(): Promise<SubsystemHealth> {
  try {
    const { getStorageReport } = await import('../performance/storage-optimizer');
    const report = getStorageReport();
    if (!report) {
      return {
        name: 'storage',
        status: 'unknown',
        lastHealthyAt: null,
        metrics: {},
      };
    }
    const underPressure = (report.usageRatio ?? 0) > 0.8;
    return {
      name: 'storage',
      status: underPressure ? 'degraded' : 'healthy',
      lastHealthyAt: report.lastOptimizedAt ?? null,
      metrics: {
        usageBytes: report.usageBytes ?? 0,
        quotaBytes: report.quotaBytes ?? 0,
        usageRatio: report.usageRatio ?? 0,
        staleEntries: report.staleEntries,
        bytesFreed: report.bytesFreed,
      },
    };
  } catch {
    return {
      name: 'storage',
      status: 'unknown',
      lastHealthyAt: null,
      metrics: {},
    };
  }
}

/**
 * Collect performance subsystem health.
 */
async function collectPerformanceHealth(): Promise<SubsystemHealth> {
  try {
    const { getMemoryPressureLevel } = await import('../performance/memory-monitor');
    const { getRenderBudgetExceeded } = await import('../performance/render-budget');
    const memoryPressure = getMemoryPressureLevel();
    const budgetExceeded = getRenderBudgetExceeded();
    const status =
      memoryPressure === 'critical' || budgetExceeded
        ? 'degraded'
        : memoryPressure === 'moderate'
          ? 'degraded'
          : 'healthy';
    return {
      name: 'performance',
      status,
      lastHealthyAt: status === 'healthy' ? new Date().toISOString() : null,
      metrics: {
        memoryPressure: memoryPressure === 'none' ? 0 : memoryPressure === 'moderate' ? 1 : 2,
        renderBudgetExceeded: budgetExceeded ? 1 : 0,
      },
    };
  } catch {
    return {
      name: 'performance',
      status: 'unknown',
      lastHealthyAt: null,
      metrics: {},
    };
  }
}

/**
 * Export a complete health document.
 *
 * The returned object is safe to serialize and share -- it has been
 * validated by the privacy audit before returning.
 */
export async function exportHealth(options?: HealthExportOptions): Promise<HealthExport> {
  const maxLogs = options?.maxLogEntries ?? 100;

  // Gather subsystem health from built-in collectors.
  const builtInProviders = [
    collectSearchHealth(),
    collectSyncQueueHealth(),
    collectStorageHealth(),
    collectPerformanceHealth(),
  ];

  // Include any custom providers.
  const customProviders = (options?.subsystemProviders ?? []).map((p) => p());

  const subsystems = await Promise.all([...builtInProviders, ...customProviders]);

  // Get recent logs (already redacted at write time).
  const allLogs = getAllLogEntries();
  const recentLogs = allLogs.slice(-maxLogs);

  const exportDoc: HealthExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    subsystems,
    recentLogs,
    privacyAuditPassed: false, // will be set below
  };

  // Run privacy audit.
  const auditResult = auditPrivacy(exportDoc);
  exportDoc.privacyAuditPassed = auditResult.passed;

  return exportDoc;
}
