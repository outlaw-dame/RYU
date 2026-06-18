/**
 * Phase 29 - useEditionReviews hook.
 *
 * Returns reviews for a given edition from the local RxDB database,
 * with support for refresh and deletion.
 */

import { useCallback, useEffect, useState } from 'react';
import { listReviewsByEdition, deleteReview } from '../reviews/review-store';
import { enqueuePublish } from '../reviews/publish-queue';
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
    // Find the review before deleting to check visibility
    const review = reviews.find((r) => r.id === reviewId);
    const success = await deleteReview(reviewId);
    if (success) {
      // Enqueue remote delete for public reviews
      if (review && review.visibility === 'public') {
        await enqueuePublish({
          reviewId,
          editionId: review.editionId,
          userId: review.userId,
          action: 'delete',
          visibility: review.visibility,
          payload: { reviewId, editionId: review.editionId }
        });
      }
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    }
    return success;
  }, [reviews]);

  return { reviews, loading, error, reload, remove };
}
