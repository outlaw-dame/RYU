/**
 * useSearchHealth — React hook for search index health monitoring.
 *
 * Provides health status + manual repair trigger.
 *
 * Usage:
 *   const { health, isChecking, isRepairing, checkHealth, repair } = useSearchHealth();
 */

import { useCallback, useState } from "react";
import type { SearchIndexHealth } from "./index-lifecycle";
import { useSearchEngine } from "./SearchProvider";

export type SearchHealthState = {
  health: SearchIndexHealth | null;
  isChecking: boolean;
  isRepairing: boolean;
  checkHealth: () => Promise<void>;
  repair: () => Promise<void>;
};

export function useSearchHealth(): SearchHealthState {
  const engine = useSearchEngine();
  const [health, setHealth] = useState<SearchIndexHealth | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await engine.inspectHealth();
      setHealth(result);
    } finally {
      setIsChecking(false);
    }
  }, [engine]);

  const repair = useCallback(async () => {
    setIsRepairing(true);
    try {
      await engine.repair();
      // Refresh health after repair
      const result = await engine.inspectHealth();
      setHealth(result);
    } finally {
      setIsRepairing(false);
    }
  }, [engine]);

  return { health, isChecking, isRepairing, checkHealth, repair };
}
