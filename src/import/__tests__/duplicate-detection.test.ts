import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the database module - use a factory that doesn't reference outer variables
vi.mock('../../db/client', () => {
  const mockExec = vi.fn().mockResolvedValue(null);
  const mockFindOne = vi.fn(() => ({ exec: mockExec }));
  const mockFind = vi.fn(() => ({ exec: mockExec }));
  const mockFindByIds = vi.fn(() => ({ exec: vi.fn().mockResolvedValue(new Map()) }));

  return {
    initializeDatabase: vi.fn().mockResolvedValue({
      entityresolutions: { findOne: mockFindOne, find: mockFind },
      editions: { findOne: mockFindOne, find: mockFind },
      authors: { findByIds: mockFindByIds }
    }),
    DEFAULT_RYU_DATABASE_NAME: 'ryu',
    __mocks: { mockExec, mockFindOne, mockFind, mockFindByIds }
  };
});

import { initializeDatabase } from '../../db/client';
import { checkDuplicateByUri, checkDuplicateByIsbn, checkDuplicateByTitleAuthor, detectDuplicate } from '../duplicate-detection';

// Access the mocks via the module
function getMocks() {
  const mod = vi.mocked(initializeDatabase);
  return mod;
}

describe('duplicate-detection', () => {
  let dbMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock = await initializeDatabase();
    // Reset default behavior
    dbMock.entityresolutions.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    dbMock.editions.find.mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });
  });

  describe('checkDuplicateByUri', () => {
    it('returns isDuplicate false when no match found', async () => {
      dbMock.entityresolutions.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null)
      });

      const result = await checkDuplicateByUri('https://bookwyrm.social/book/999');
      expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate true with match info when URI exists', async () => {
      dbMock.entityresolutions.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          toJSON: () => ({ id: 'res-1', canonicalUri: 'https://bookwyrm.social/book/1', entityId: 'edition-1', entityType: 'edition' })
        })
      });

      const result = await checkDuplicateByUri('https://bookwyrm.social/book/1');
      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.existingId).toBe('edition-1');
        expect(result.matchType).toBe('uri');
      }
    });
  });

  describe('checkDuplicateByIsbn', () => {
    it('returns isDuplicate false for invalid ISBN', async () => {
      const result = await checkDuplicateByIsbn('123');
      expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate false when no match found', async () => {
      dbMock.editions.find.mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });

      const result = await checkDuplicateByIsbn('9780321125217');
      expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate true when ISBN-13 matches', async () => {
      dbMock.editions.find
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue([
            { toJSON: () => ({ id: 'edition-isbn', isbn13: '9780321125217' }) }
          ])
        });

      const result = await checkDuplicateByIsbn('9780321125217');
      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.existingId).toBe('edition-isbn');
        expect(result.matchType).toBe('isbn');
      }
    });
  });

  describe('checkDuplicateByTitleAuthor', () => {
    it('returns isDuplicate false for short titles', async () => {
      const result = await checkDuplicateByTitleAuthor('AB');
      expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate false when no editions exist', async () => {
      dbMock.editions.find.mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });
      const result = await checkDuplicateByTitleAuthor('Dune');
      expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate true when title matches', async () => {
      dbMock.editions.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          { toJSON: () => ({ id: 'edition-dune', title: 'Dune', authorIds: [] }) }
        ])
      });

      const result = await checkDuplicateByTitleAuthor('dune');
      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.existingId).toBe('edition-dune');
        expect(result.matchType).toBe('title_author');
      }
    });
  });

  describe('detectDuplicate', () => {
    it('short-circuits on URI match', async () => {
      dbMock.entityresolutions.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          toJSON: () => ({ id: 'res-1', entityId: 'ed-1', entityType: 'edition' })
        })
      });

      const result = await detectDuplicate({ uri: 'https://example.com/book/1', isbn: '1234567890' });
      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.matchType).toBe('uri');
      }
    });

    it('returns isDuplicate false when no params match', async () => {
      const result = await detectDuplicate({});
      expect(result.isDuplicate).toBe(false);
    });
  });
});
