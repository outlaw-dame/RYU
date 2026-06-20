/**
 * Phase 39 -- Programmatic release checklist.
 *
 * Orchestrates all audit modules and produces a BetaReadinessReport.
 * Can be run programmatically or via the CLI eval script.
 */

import type { BetaReadinessReport, CheckResult } from './types';
import { runInstallabilityAudit } from './installability-audit';
import type { ManifestData } from './installability-audit';
import { runServiceWorkerAudit } from './service-worker-audit';
import type { ServiceWorkerInfo } from './service-worker-audit';
import { runDataMigrationAudit } from './data-migration-audit';
import type { DataMigrationInfo } from './data-migration-audit';
import { runSettingsAudit } from './settings-audit';
import type { SettingsInfo } from './settings-audit';
import { getKnownLimitationSummaries } from './known-limitations';

export interface ReleaseChecklistInput {
  manifest: ManifestData;
  serviceWorkerRegistered: boolean;
  isHttps: boolean;
  serviceWorkerInfo: ServiceWorkerInfo;
  dataMigrationInfo: DataMigrationInfo;
  settingsInfo: SettingsInfo;
  /** Additional smoke-test results (build pass, tests pass, no console.log). */
  smokeTests?: CheckResult[];
}

/**
 * Run the full release checklist and produce a BetaReadinessReport.
 */
export function runReleaseChecklist(input: ReleaseChecklistInput): BetaReadinessReport {
  const results: CheckResult[] = [];

  // Installability checks
  results.push(
    ...runInstallabilityAudit(input.manifest, {
      serviceWorkerRegistered: input.serviceWorkerRegistered,
      isHttps: input.isHttps,
    })
  );

  // Service worker checks
  results.push(...runServiceWorkerAudit(input.serviceWorkerInfo));

  // Data migration checks
  results.push(...runDataMigrationAudit(input.dataMigrationInfo));

  // Settings checks
  results.push(...runSettingsAudit(input.settingsInfo));

  // Smoke tests (if provided)
  if (input.smokeTests) {
    results.push(...input.smokeTests);
  }

  const passedChecks = results.filter((r) => r.passed).length;
  const failedChecks = results.filter((r) => !r.passed).length;
  const criticalFailures = results.filter((r) => !r.passed && r.severity === 'critical');
  const warnings = results.filter((r) => !r.passed && r.severity === 'warning').length;

  return {
    timestamp: new Date().toISOString(),
    passed: criticalFailures.length === 0,
    totalChecks: results.length,
    passedChecks,
    failedChecks,
    warnings,
    results,
    knownLimitations: getKnownLimitationSummaries(),
  };
}

/**
 * Format a report as a human-readable string for console output.
 */
export function formatReport(report: BetaReadinessReport): string {
  const lines: string[] = [];

  lines.push('=== Beta Readiness Report ===');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Overall: ${report.passed ? 'PASS' : 'FAIL'}`);
  lines.push(`Checks: ${report.passedChecks}/${report.totalChecks} passed, ${report.warnings} warnings`);
  lines.push('');

  // Group by category
  const byCategory = new Map<string, CheckResult[]>();
  for (const r of report.results) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  for (const [category, checks] of byCategory) {
    lines.push(`--- ${category} ---`);
    for (const check of checks) {
      const icon = check.passed ? '[PASS]' : check.severity === 'critical' ? '[FAIL]' : '[WARN]';
      lines.push(`  ${icon} ${check.name}`);
      if (!check.passed && check.failureReason) {
        lines.push(`        ${check.failureReason}`);
      }
    }
    lines.push('');
  }

  if (report.knownLimitations.length > 0) {
    lines.push('--- Known Limitations ---');
    for (const limitation of report.knownLimitations) {
      lines.push(`  - ${limitation}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
