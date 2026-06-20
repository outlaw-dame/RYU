/**
 * Phase 38 -- useDiagnostics hook.
 *
 * Combines all diagnostic sources into a single React hook for use
 * in debug panels and diagnostic UIs. Provides access to the health
 * export, diagnostic report, and individual subsystem loggers.
 *
 * PRIVACY: All data exposed by this hook has already been redacted
 * and validated through the privacy audit pipeline.
 */

import { useCallback, useState } from 'react';
import type { DiagnosticReport, HealthExport } from '../observability/types';
import { collectDiagnosticReport } from '../observability/diagnostic-collector';
import { exportHealth } from '../observability/health-exporter';

export interface UseDiagnosticsResult {
  /** Latest diagnostic report (null until first capture). */
  report: DiagnosticReport | null;
  /** Latest health export (null until first export). */
  healthExport: HealthExport | null;
  /** Whether a capture/export is currently in progress. */
  isLoading: boolean;
  /** Error message from the last failed operation. */
  error: string | null;
  /** Trigger a fresh diagnostic report capture. */
  captureReport: () => Promise<void>;
  /** Trigger a fresh health export. */
  captureHealthExport: () => Promise<void>;
}

/**
 * React hook providing unified diagnostic access.
 *
 * Usage:
 * ```tsx
 * const { report, captureReport, isLoading } = useDiagnostics();
 * ```
 */
export function useDiagnostics(): UseDiagnosticsResult {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [healthExp, setHealthExp] = useState<HealthExport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await collectDiagnosticReport();
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to capture diagnostic report');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const captureHealthExport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await exportHealth();
      setHealthExp(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to capture health export');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    report,
    healthExport: healthExp,
    isLoading,
    error,
    captureReport,
    captureHealthExport,
  };
}
