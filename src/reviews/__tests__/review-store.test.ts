import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockReviews = {
    upsert: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn(),
    find: vi.fn()
  };
  return {
    mockReviews,
    mockDb: { reviews: mockReviews },
    removeFromInMemoryVectorIndex: vi.fn()
  };
});

vi.mock('../../db/client', () => ({
  initializeDatabase: vi.fn().mockResolvedValue(mocks.mockDb)
}));

vi.mock('../../search/vector-index', () => ({
  removeFromInMemoryVectorIndex: mocks.removeFromInMemoryVectorIndex
}));

import { createReview, deleteReview, listReviewsByEdition, getReviewById, isTombstoned } from '../review-store';

describe('review-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('createReview', () => {
    it('creates a review and inserts into database', async () => {
      const review = await createReview({
        editionId: 'edition-1',
        userId: 'user-1',
        contentType: 'review',
        title: 'My Review',
        content: 'Great book!',
        rating: 5,
        visibility: 'public'
      });

      expect(review.id).toMatch(/^local-review-/);
      expect(review.editionId).toBe('edition-1');
      expect(review.userId).toBe('user-1');
      expect(review.content).toBe('Great book!');
      expect(review.rating).toBe(5);
      expect(review.status).toBe('published');
      expect(review.visibility).toBe('public');
      expect(mocks.mockReviews.upsert).toHaveBeenCalledTimes(1);
    });

    it('handles null rating', async () => {
      const review = await createReview({
        editionId: 'edition-1',
        userId: 'user-1',
        contentType: 'note',
        content: 'A quick thought',
        rating: null,
        visibility: 'private'
      });

      expect(review.rating).toBeNull();
      expect(review.visibility).toBe('private');
    });
  });

  describe('deleteReview', () => {
    it('removes from search index and RxDB', async () => {
      const mockDoc = {
        id: 'review-1',
        remove: vi.fn().mockResolvedValue(undefined)
      };
      mocks.mockReviews.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(mockDoc) });

      const success = await deleteReview('review-1');

      expect(success).toBe(true);
      expect(mocks.removeFromInMemoryVectorIndex).toHaveBeenCalledWith('review-1');
      expect(mockDoc.remove).toHaveBeenCalledTimes(1);
    });

    it('stores a tombstone to prevent resurrection', async () => {
      const mockDoc = {
        id: 'review-2',
        remove: vi.fn().mockResolvedValue(undefined)
      };
      mocks.mockReviews.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(mockDoc) });

      await deleteReview('review-2');

      expect(isTombstoned('review-2')).toBe(true);
    });

    it('returns false when review does not exist', async () => {
      mocks.mockReviews.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const success = await deleteReview('nonexistent');
      expect(success).toBe(false);
    });
  });

  describe('listReviewsByEdition', () => {
    it('excludes tombstoned reviews', async () => {
      const docs = [
        { id: 'r1', toJSON: () => ({ id: 'r1', editionId: 'e1', accountId: 'u1', content: 'A', importedAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }) },
        { id: 'r2', toJSON: () => ({ id: 'r2', editionId: 'e1', accountId: 'u1', content: 'B', importedAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }) }
      ];
      mocks.mockReviews.find.mockReturnValue({ exec: vi.fn().mockResolvedValue(docs) });

      // Tombstone r2
      const tombstones = JSON.stringify({ r2: '2025-01-01T00:00:00.000Z' });
      window.localStorage.setItem('ryu.review-tombstones', tombstones);

      const reviews = await listReviewsByEdition('e1');
      expect(reviews).toHaveLength(1);
      expect(reviews[0].id).toBe('r1');
    });
  });

  describe('getReviewById', () => {
    it('returns null for tombstoned review', async () => {
      const doc = { id: 'r3', toJSON: () => ({ id: 'r3', editionId: 'e1', accountId: 'u1', content: 'C', importedAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }) };
      mocks.mockReviews.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc) });

      const tombstones = JSON.stringify({ r3: '2025-01-01T00:00:00.000Z' });
      window.localStorage.setItem('ryu.review-tombstones', tombstones);

      const result = await getReviewById('r3');
      expect(result).toBeNull();
    });
  });
});
