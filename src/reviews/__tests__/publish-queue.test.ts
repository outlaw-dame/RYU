import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockWriteQueue = {
    upsert: vi.fn().mockResolvedValue(undefined),
    find: vi.fn(),
    findOne: vi.fn()
  };
  return {
    mockWriteQueue,
    mockDb: { writequeue: mockWriteQueue }
  };
});

vi.mock('../../db/client', () => ({
  initializeDatabase: vi.fn().mockResolvedValue(mocks.mockDb)
}));

import { enqueuePublish } from '../publish-queue';

describe('publish-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('enqueuePublish', () => {
    it('enqueues a public review for publishing', async () => {
      const entry = await enqueuePublish({
        reviewId: 'review-1',
        editionId: 'edition-1',
        userId: 'user-1',
        action: 'create',
        visibility: 'public',
        payload: { title: 'My Review', content: 'Great!' }
      });

      expect(entry).not.toBeNull();
      expect(entry!.reviewId).toBe('review-1');
      expect(entry!.status).toBe('pending');
      expect(entry!.action).toBe('create');
      expect(mocks.mockWriteQueue.upsert).toHaveBeenCalledTimes(1);
    });

    it('rejects private reviews from being queued', async () => {
      const entry = await enqueuePublish({
        reviewId: 'review-2',
        editionId: 'edition-1',
        userId: 'user-1',
        action: 'create',
        visibility: 'private',
        payload: { content: 'Private note' }
      });

      expect(entry).toBeNull();
      expect(mocks.mockWriteQueue.upsert).not.toHaveBeenCalled();
    });

    it('enqueues delete operations for public reviews', async () => {
      const entry = await enqueuePublish({
        reviewId: 'review-3',
        editionId: 'edition-1',
        userId: 'user-1',
        action: 'delete',
        visibility: 'public',
        payload: { reviewId: 'review-3' }
      });

      expect(entry).not.toBeNull();
      expect(entry!.action).toBe('delete');
    });
  });
});
