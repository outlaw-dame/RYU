/**
 * Phase 38 -- Diagnostic collector.
 *
 * Aggregates metrics from all subsystems into a unified diagnostic
 * surface. Acts as the single entry point for generating a full
 * diagnostic report.
 *
 * PRIVACY: The collector re-validates all data through the privacy
 * audit before returning a DiagnosticReport.
 */

import type { DiagnosticReport, SubsystemHealth } from './types';
import { getAllLogEntries } from './redacted-logger';
import { auditPrivacy } from './privacy-audit';

/**
 * Collect a full diagnostic report from all subsystems.
 *
 * This is the primary entry point for generating reports that developers
 * can use to debug user issues without accessing private data.
 */
export async function collectDiagnosticReport(): Promise<DiagnosticReport> {
  const subsystems: SubsystemHealth[] = [];

  // Search subsystem
  try {
    const { captureSearchDiagnosticsSnapshot } = await import(
      '../search/observability/searchDiagnosticsSnapshot'
    );
    const snapshot = await captureSearchDiagnosticsSnapshot();
    const indexHealthy = snapshot.index.health !== null && !snapshot.index.healthError;
    subsystems.push({
      name: 'search',
      status: indexHealthy ? 'healthy' : 'degraded',
      lastHealthyAt: indexHealthy ? snapshot.capturedAt : null,
      metrics: {
        writeThroughPending: snapshot.queue.writeThroughPending,
        writeThroughActive: snapshot.queue.writeThroughActive,
        providerGeneration: snapshot.engine.providerGeneration,
        modelCount: snapshot.model.models.length,
      },
    });
  } catch {
    subsystems.push({
      name: 'search',
      status: 'error',
      lastHealthyAt: null,
      metrics: {},
    });
  }

  // Sync queue subsystem
  let syncPending = 0;
  let syncProcessing = 0;
  let syncCompleted = 0;
  let syncFailed = 0;
  try {
    const { getSyncQueueEngine } = await import('../hooks/useSyncQueueHealth');
    const engine = getSyncQueueEngine();
    const health = engine.health();
    syncPending = health.pending;
    syncProcessing = health.processing;
    syncCompleted = health.completed;
    syncFailed = health.failed;
    subsystems.push({
      name: 'sync',
      status: health.failed > 0 ? 'degraded' : 'healthy',
      lastHealthyAt: health.lastSuccessAt,
      metrics: {
        pending: health.pending,
        processing: health.processing,
        completed: health.completed,
        failed: health.failed,
      },
    });
  } catch {
    subsystems.push({
      name: 'sync',
      status: 'unknown',
      lastHealthyAt: null,
      metrics: {},
    });
  }

  // Storage subsystem
  let storageUsageRatio: number | undefined;
  try {
    const { getStorageReport } = await import('../performance/storage-optimizer');
    const report = getStorageReport();
    storageUsageRatio = report?.usageRatio ?? undefined;
    subsystems.push({
      name: 'storage',
      status: (report?.usageRatio ?? 0) > 0.8 ? 'degraded' : 'healthy',
      lastHealthyAt: report?.lastOptimizedAt ?? null,
      metrics: {
        usageBytes: report?.usageBytes ?? 0,
        quotaBytes: report?.quotaBytes ?? 0,
        usageRatio: report?.usageRatio ?? 0,
        staleEntries: report?.staleEntries ?? 0,
      },
    });
  } catch {
    subsystems.push({
      name: 'storage',
      status: 'unknown',
      lastHealthyAt: null,
      metrics: {},
    });
  }

  // Performance subsystem
  let memoryPressure = 'none';
  let renderBudgetExceeded = false;
  try {
    const { getMemoryPressureLevel } = await import('../performance/memory-monitor');
    const { getRenderBudgetExceeded } = await import('../performance/render-budget');
    memoryPressure = getMemoryPressureLevel();
    renderBudgetExceeded = getRenderBudgetExceeded();
    const status =
      memoryPressure === 'critical' || renderBudgetExceeded
        ? 'degraded'
        : memoryPressure === 'moderate'
          ? 'degraded'
          : 'healthy';
    subsystems.push({
      name: 'performance',
      status,
      lastHealthyAt: status === 'healthy' ? new Date().toISOString() : null,
      metrics: {
        memoryPressure: memoryPressure === 'none' ? 0 : memoryPressure === 'moderate' ? 1 : 2,
        renderBudgetExceeded: renderBudgetExceeded ? 1 : 0,
      },
    });
  } catch {
    subsystems.push({
      name: 'performance',
      status: 'unknown',
      lastHealthyAt: null,
      metrics: {},
    });
  }

  // Gather logs
  const recentLogs = getAllLogEntries().slice(-200);

  const report: DiagnosticReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    subsystems,
    recentLogs,
    performanceSummary: {
      memoryPressure,
      renderBudgetExceeded,
      storageUsageRatio,
    },
    syncQueueSummary: {
      pending: syncPending,
      processing: syncProcessing,
      completed: syncCompleted,
      failed: syncFailed,
    },
    privacyAuditPassed: false,
  };

  // Run privacy audit
  const auditResult = auditPrivacy(report);
  report.privacyAuditPassed = auditResult.passed;

  return report;
}
