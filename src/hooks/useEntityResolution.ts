/**
 * Phase 27: React hook for entity resolution.
 *
 * Provides merge candidates, merge/undo actions, and
 * resolution status for the UI layer.
 */

import { useCallback, useEffect, useState } from 'react';
import { initializeDatabase } from '../db/client';
import type { AuthorDoc } from '../db/schema';
import type { MergeCandidate, MergeResult, UndoSnapshot } from '../entity-resolution/types';
import { findAuthorAliases } from '../entity-resolution/author-normalizer';
import { executeMerge } from '../entity-resolution/merge-engine';
import { undoMerge } from '../entity-resolution/merge-engine';
import { getUndoSnapshots, getUndoCount } from '../entity-resolution/undo-store';

export type EntityResolutionState = {
  /** Suggested merge candidates. */
  candidates: MergeCandidate[];
  /** Whether candidates are being computed. */
  loading: boolean;
  /** Error from the last operation. */
  error: Error | null;
  /** Recent merge history (for undo). */
  undoHistory: UndoSnapshot[];
  /** Number of available undo operations. */
  undoCount: number;
};

export type EntityResolutionActions = {
  /** Refresh merge candidates by scanning the database. */
  refresh: () => Promise<void>;
  /** Execute a merge operation. */
  merge: (targetId: string, sourceId: string, entityType: 'author' | 'work' | 'edition' | 'review') => Promise<MergeResult>;
  /** Undo a previous merge. */
  undo: (undoSnapshotId: string) => Promise<void>;
};

/**
 * Hook for entity resolution: finding merge candidates and performing merges.
 */
export function useEntityResolution(): EntityResolutionState & EntityResolutionActions {
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [undoHistory, setUndoHistory] = useState<UndoSnapshot[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const refreshUndoState = useCallback(() => {
    setUndoHistory(getUndoSnapshots());
    setUndoCount(getUndoCount());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = await initializeDatabase();
      const authorDocs = await db.authors.find().exec();
      const authors = authorDocs.map((doc) => {
        const data = doc.toJSON() as AuthorDoc;
        return { id: data.id, name: data.name };
      });

      // Find author aliases
      const aliases = findAuthorAliases(authors, 0.7);
      const authorCandidates: MergeCandidate[] = aliases.map((alias) => ({
        entityA: alias.idA,
        entityB: alias.idB,
        entityType: 'author' as const,
        confidence: alias.confidence,
        reason: 'author_alias' as const
      }));

      setCandidates(authorCandidates);
      refreshUndoState();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [refreshUndoState]);

  const merge = useCallback(async (
    targetId: string,
    sourceId: string,
    entityType: 'author' | 'work' | 'edition' | 'review'
  ): Promise<MergeResult> => {
    setError(null);
    try {
      const db = await initializeDatabase();
      const result = await executeMerge(db, {
        targetId,
        sourceId,
        entityType,
        initiatedAt: new Date().toISOString()
      });
      refreshUndoState();
      // Remove the merged candidate from the list
      setCandidates((prev) => prev.filter(
        (c) => !(
          (c.entityA === sourceId && c.entityB === targetId) ||
          (c.entityA === targetId && c.entityB === sourceId)
        )
      ));
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [refreshUndoState]);

  const undo = useCallback(async (undoSnapshotId: string): Promise<void> => {
    setError(null);
    try {
      const db = await initializeDatabase();
      await undoMerge(db, undoSnapshotId);
      refreshUndoState();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [refreshUndoState]);

  useEffect(() => {
    refreshUndoState();
  }, [refreshUndoState]);

  return {
    candidates,
    loading,
    error,
    undoHistory,
    undoCount,
    refresh,
    merge,
    undo
  };
}
