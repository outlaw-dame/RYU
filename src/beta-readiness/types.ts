/**
 * Phase 39 -- Beta readiness types.
 *
 * Defines the structured report format for the beta readiness audit.
 */

export type CheckCategory =
  | 'installability'
  | 'pwa'
  | 'service-worker'
  | 'data-migration'
  | 'settings'
  | 'smoke-tests';

export interface CheckResult {
  /** Human-readable name of the check. */
  name: string;
  /** Category this check belongs to. */
  category: CheckCategory;
  /** Whether the check passed. */
  passed: boolean;
  /** Human-readable description of what was checked. */
  description: string;
  /** If failed, what went wrong. */
  failureReason?: string;
  /** Severity: critical failures block release, warnings are advisory. */
  severity: 'critical' | 'warning';
}

export interface BetaReadinessReport {
  /** ISO timestamp of when the report was generated. */
  timestamp: string;
  /** Overall pass/fail. True only if all critical checks pass. */
  passed: boolean;
  /** Total number of checks run. */
  totalChecks: number;
  /** Number of checks that passed. */
  passedChecks: number;
  /** Number of checks that failed. */
  failedChecks: number;
  /** Number of warnings (non-critical failures). */
  warnings: number;
  /** Individual check results grouped by category. */
  results: CheckResult[];
  /** Summary of known limitations for beta users. */
  knownLimitations: string[];
}
