import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage for undo-store
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import { executeMerge, undoMerge } from '../merge-engine';
import type { MergeOperation } from '../types';

function createMockDoc(data: Record<string, unknown>) {
  return {
    toJSON: () => ({ ...data }),
    remove: vi.fn().mockResolvedValue(undefined),
    incrementalPatch: vi.fn().mockResolvedValue(undefined)
  };
}

function createMockCollection(docs: Array<Record<string, unknown>>) {
  const mockDocs = docs.map(createMockDoc);
  return {
    findOne: vi.fn(({ selector }: { selector: Record<string, unknown> }) => ({
      exec: vi.fn().mockResolvedValue(
        mockDocs.find((d) => {
          const json = d.toJSON();
          return Object.entries(selector).every(([k, v]) => json[k] === v);
        }) ?? null
      )
    })),
    find: vi.fn(({ selector }: { selector?: Record<string, unknown> } = {}) => ({
      exec: vi.fn().mockResolvedValue(
        selector
          ? mockDocs.filter((d) => {
              const json = d.toJSON();
              return Object.entries(selector).every(([k, v]) => json[k] === v);
            })
          : mockDocs
      )
    })),
    upsert: vi.fn().mockResolvedValue(undefined)
  };
}

describe('merge-engine', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();

    mockDb = {
      authors: createMockCollection([
        { id: 'author-1', name: 'Frank Herbert', importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'author-2', name: 'Herbert, Frank', importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
      ]),
      works: createMockCollection([
        { id: 'work-1', title: 'Dune', authorIds: ['author-1'], importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
      ]),
      editions: createMockCollection([
        { id: 'edition-1', title: 'Dune', authorIds: ['author-1'], workId: 'work-1', sourceUrl: 'http://example.com', importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'edition-2', title: 'Dune (Paperback)', authorIds: ['author-2'], workId: 'work-1', sourceUrl: 'http://example.com/2', importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
      ]),
      reviews: createMockCollection([
        { id: 'review-1', content: 'Great book!', editionId: 'edition-2', accountId: 'user-1', published: '2024-01-01T00:00:00.000Z', importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
      ]),
      entityresolutions: createMockCollection([]),
      searchvectors: createMockCollection([
        { id: 'sv-1', entityId: 'author-2', entityType: 'author', model: 'test', dimensions: 3, textHash: 'abc', vector: [1, 2, 3], indexedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
      ])
    };
  });

  describe('executeMerge', () => {
    it('throws when source entity does not exist', async () => {
      const operation: MergeOperation = {
        targetId: 'author-1',
        sourceId: 'nonexistent',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      await expect(executeMerge(mockDb, operation)).rejects.toThrow(
        'Source entity not found: nonexistent'
      );
    });

    it('throws when target entity does not exist', async () => {
      const operation: MergeOperation = {
        targetId: 'nonexistent',
        sourceId: 'author-2',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      await expect(executeMerge(mockDb, operation)).rejects.toThrow(
        'Target entity not found: nonexistent'
      );
    });

    it('merges author entities successfully', async () => {
      const operation: MergeOperation = {
        targetId: 'author-1',
        sourceId: 'author-2',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      const result = await executeMerge(mockDb, operation);

      expect(result.canonicalId).toBe('author-1');
      expect(result.mergedId).toBe('author-2');
      expect(result.entityType).toBe('author');
      expect(result.undoSnapshotId).toBeDefined();
    });

    it('creates a resolution record for the merged entity', async () => {
      const operation: MergeOperation = {
        targetId: 'author-1',
        sourceId: 'author-2',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      await executeMerge(mockDb, operation);

      // Resolution record should be upserted
      expect(mockDb.entityresolutions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalUri: 'author-2',
          entityId: 'author-1',
          entityType: 'author'
        })
      );
    });

    it('removes search vectors for merged-away entity', async () => {
      const operation: MergeOperation = {
        targetId: 'author-1',
        sourceId: 'author-2',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      await executeMerge(mockDb, operation);

      // The search vector for author-2 should have been removed
      const svDocs = await mockDb.searchvectors.find({ selector: { entityId: 'author-2' } }).exec();
      for (const doc of svDocs) {
        expect(doc.remove).toHaveBeenCalled();
      }
    });

    it('removes the source entity document', async () => {
      const operation: MergeOperation = {
        targetId: 'author-1',
        sourceId: 'author-2',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      await executeMerge(mockDb, operation);

      const sourceDoc = await mockDb.authors.findOne({ selector: { id: 'author-2' } }).exec();
      expect(sourceDoc!.remove).toHaveBeenCalled();
    });

    it('saves an undo snapshot', async () => {
      const operation: MergeOperation = {
        targetId: 'author-1',
        sourceId: 'author-2',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      const result = await executeMerge(mockDb, operation);

      // Check localStorage was updated with undo data
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(stored[0].id).toBe(result.undoSnapshotId);
      expect(stored[0].operation.sourceId).toBe('author-2');
      expect(stored[0].operation.targetId).toBe('author-1');
    });

    it('transfers reviews when merging editions', async () => {
      // Rebuild mock to have reviews on the source edition
      mockDb.editions = createMockCollection([
        { id: 'edition-1', title: 'Dune', authorIds: ['author-1'], workId: 'work-1', sourceUrl: 'http://example.com', importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'edition-2', title: 'Dune (Paperback)', authorIds: ['author-1'], workId: 'work-1', sourceUrl: 'http://example.com/2', importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
      ]);

      const reviewDoc = createMockDoc({
        id: 'review-1', content: 'Great book!', editionId: 'edition-2',
        accountId: 'user-1', published: '2024-01-01T00:00:00.000Z',
        importedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'
      });
      mockDb.reviews = {
        findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(reviewDoc) })),
        find: vi.fn(({ selector }: { selector?: Record<string, unknown> } = {}) => ({
          exec: vi.fn().mockResolvedValue(
            selector?.editionId === 'edition-2' ? [reviewDoc] : []
          )
        })),
        upsert: vi.fn().mockResolvedValue(undefined)
      };

      const operation: MergeOperation = {
        targetId: 'edition-1',
        sourceId: 'edition-2',
        entityType: 'edition',
        initiatedAt: new Date().toISOString()
      };

      const result = await executeMerge(mockDb, operation);

      expect(result.reviewsTransferred).toBe(1);
      expect(reviewDoc.incrementalPatch).toHaveBeenCalledWith(
        expect.objectContaining({ editionId: 'edition-1' })
      );
    });
  });

  describe('undoMerge', () => {
    it('throws when snapshot not found', async () => {
      await expect(undoMerge(mockDb, 'nonexistent')).rejects.toThrow(
        'Undo snapshot not found: nonexistent'
      );
    });

    it('restores entity and removes resolution records', async () => {
      // First perform a merge
      const operation: MergeOperation = {
        targetId: 'author-1',
        sourceId: 'author-2',
        entityType: 'author',
        initiatedAt: new Date().toISOString()
      };

      const result = await executeMerge(mockDb, operation);

      // Now make findOne return the resolution record for removal
      const resolutionDoc = createMockDoc({
        id: `res:author-2`,
        canonicalUri: 'author-2',
        entityType: 'author',
        entityId: 'author-1',
        resolvedAt: '2024-01-01T00:00:00.000Z'
      });
      mockDb.entityresolutions.findOne = vi.fn(() => ({
        exec: vi.fn().mockResolvedValue(resolutionDoc)
      }));

      await undoMerge(mockDb, result.undoSnapshotId);

      // The source entity should be re-upserted
      expect(mockDb.authors.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'author-2', name: 'Herbert, Frank' })
      );

      // Resolution record should be removed
      expect(resolutionDoc.remove).toHaveBeenCalled();
    });
  });
});
