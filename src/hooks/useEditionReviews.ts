/**
 * Phase 29 - useEditionReviews hook.
 *
 * Returns reviews for a given edition from the local RxDB database,
 * with support for refresh and deletion.
 */

import { useCallback, useEffect, useState } from 'react';
import { listReviewsByEdition, deleteReview } from '../reviews/review-store';
import type { LocalReview } from '../reviews/types';

export type UseEditionReviewsResult = {
  reviews: LocalReview[];
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
  remove: (reviewId: string) => Promise<boolean>;
};

export function useEditionReviews(editionId: string | null): UseEditionReviewsResult {
  const [reviews, setReviews] = useState<LocalReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    if (!editionId) {
      setReviews([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await listReviewsByEdition(editionId);
      setReviews(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [editionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = useCallback(async (reviewId: string): Promise<boolean> => {
    const success = await deleteReview(reviewId);
    if (success) {
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    }
    return success;
  }, []);

  return { reviews, loading, error, reload, remove };
}
