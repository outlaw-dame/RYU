/**
 * Phase 26: React hook for import queue state and controls.
 *
 * Provides reactive access to the import queue for building
 * import progress UI components.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getImportQueue, type ImportQueue } from '../import/import-queue';
import type { ImportJob, ImportQueueSnapshot } from '../import/types';

type UseImportQueueResult = {
  /** Current snapshot of all jobs and counts */
  snapshot: ImportQueueSnapshot;
  /** Enqueue a new import (URL, ISBN, or manual). Returns the job or null if duplicate. */
  enqueue: (input: string) => ImportJob | null;
  /** Retry a failed job */
  retry: (jobId: string) => void;
  /** Remove a job from the queue */
  remove: (jobId: string) => void;
  /** Whether any jobs are currently processing */
  isProcessing: boolean;
  /** Whether there are any failed jobs */
  hasFailed: boolean;
};

let cachedSnapshot: ImportQueueSnapshot = { jobs: [], pending: 0, processing: 0, completed: 0, failed: 0 };

function getSnapshotFromQueue(queue: ImportQueue): ImportQueueSnapshot {
  return queue.snapshot();
}

export function useImportQueue(): UseImportQueueResult {
  const queue = getImportQueue();

  const snapshot = useSyncExternalStore(
    queue.subscribe,
    () => {
      const next = getSnapshotFromQueue(queue);
      // Detect changes by comparing job references (not just counts)
      const jobsChanged = next.jobs.length !== cachedSnapshot.jobs.length ||
        next.jobs.some((job, i) => job !== cachedSnapshot.jobs[i]);
      if (jobsChanged) {
        cachedSnapshot = next;
      }
      return cachedSnapshot;
    },
    () => cachedSnapshot
  );

  const enqueue = useCallback((input: string) => {
    return queue.enqueue(input);
  }, [queue]);

  const retry = useCallback((jobId: string) => {
    queue.retry(jobId);
  }, [queue]);

  const remove = useCallback((jobId: string) => {
    queue.remove(jobId);
  }, [queue]);

  return {
    snapshot,
    enqueue,
    retry,
    remove,
    isProcessing: snapshot.processing > 0,
    hasFailed: snapshot.failed > 0
  };
}
