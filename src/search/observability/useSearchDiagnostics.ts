/**
 * Phase 17 — React hook for the search diagnostics surface.
 *
 * Exposes a manual-refresh snapshot model (not auto-polling) so the
 * debug console only burns cycles when the user is actively looking.
 *
 * Usage:
 *   const { snapshot, refresh, loading } = useSearchDiagnostics();
 */

import { useCallback, useRef, useState } from "react";
import {
  captureSearchDiagnosticsSnapshot,
  type SearchDiagnosticsSnapshot
} from "./searchDiagnosticsSnapshot";

export type UseSearchDiagnosticsResult = {
  /** Most recent snapshot, or null if never captured. */
  snapshot: SearchDiagnosticsSnapshot | null;
  /** True while a capture is in flight. */
  loading: boolean;
  /** Trigger a fresh capture. Idempotent — concurrent calls collapse. */
  refresh: () => void;
  /** Error from the last capture attempt (should never happen, but defensive). */
  error: string | null;
};

export function useSearchDiagnostics(): UseSearchDiagnosticsResult {
  const [snapshot, setSnapshot] = useState<SearchDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const refresh = useCallback(() => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    setError(null);

    captureSearchDiagnosticsSnapshot()
      .then((next) => {
        setSnapshot(next);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Capture failed");
      })
      .finally(() => {
        setLoading(false);
        inflightRef.current = false;
      });
  }, []);

  return { snapshot, loading, refresh, error };
}
