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
import type { PackagingDecision } from '../native-packaging/types';

export interface ReleaseChecklistInput {
  manifest: ManifestData;
  serviceWorkerRegistered: boolean;
  isHttps: boolean;
  serviceWorkerInfo: ServiceWorkerInfo;
  dataMigrationInfo: DataMigrationInfo;
  settingsInfo: SettingsInfo;
  /** Additional smoke-test results (build pass, tests pass, no console.log). */
  smokeTests?: CheckResult[];
  /** Native packaging decision (from Phase 40 ADR-002). */
  packagingDecision?: PackagingDecision;
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

  // Packaging decision check (Phase 40)
  results.push(...runPackagingDecisionCheck(input.packagingDecision));

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
 * Run packaging decision checks.
 * Verifies that a native packaging decision has been made (ADR-002).
 */
function runPackagingDecisionCheck(decision?: PackagingDecision): CheckResult[] {
  const results: CheckResult[] = [];

  results.push({
    name: 'Native packaging decision documented',
    category: 'pwa',
    passed: decision != null,
    description: 'A packaging decision (PWA-only vs Capacitor) must be documented in ADR-002.',
    failureReason: decision == null ? 'No packaging decision provided' : undefined,
    severity: 'critical',
  });

  if (decision) {
    results.push({
      name: 'Packaging decision has rationale',
      category: 'pwa',
      passed: decision.rationale.length > 0,
      description: 'The packaging decision must include a clear rationale.',
      failureReason: decision.rationale.length === 0 ? 'Rationale is empty' : undefined,
      severity: 'warning',
    });

    results.push({
      name: 'Packaging revisit conditions defined',
      category: 'pwa',
      passed: !decision.deferredEvaluation || decision.revisitConditions.length > 0,
      description:
        'If evaluation is deferred, conditions for revisiting must be specified.',
      failureReason:
        decision.deferredEvaluation && decision.revisitConditions.length === 0
          ? 'Deferred evaluation without revisit conditions'
          : undefined,
      severity: 'warning',
    });
  }

  return results;
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
