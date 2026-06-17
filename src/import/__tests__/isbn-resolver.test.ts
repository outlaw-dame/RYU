import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isbnResultToApGraph, resolveIsbn, type IsbnLookupResult } from '../isbn-resolver';

// Mock global fetch
const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

describe('isbn-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveIsbn', () => {
    it('returns OpenLibrary result when available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Dune',
          subtitle: 'A Novel',
          key: '/books/OL123M',
          authors: [{ key: '/authors/OL456A' }],
          covers: [12345],
          isbn_10: ['0441013597'],
          isbn_13: ['9780441013593']
        })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'Frank Herbert',
          key: '/authors/OL456A'
        })
      });

      const result = await resolveIsbn('9780441013593');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Dune');
      expect(result!.authors[0].name).toBe('Frank Herbert');
      expect(result!.isbn13).toBe('9780441013593');
      expect(result!.coverUrl).toContain('covers.openlibrary.org');
      expect(result!.source).toBe('openlibrary');
    });

    it('falls back to Google Books when OpenLibrary fails', async () => {
      // OpenLibrary fails
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

      // Google Books succeeds
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            id: 'gb-123',
            volumeInfo: {
              title: 'Dune',
              authors: ['Frank Herbert'],
              description: 'A science fiction novel',
              industryIdentifiers: [
                { type: 'ISBN_13', identifier: '9780441013593' },
                { type: 'ISBN_10', identifier: '0441013597' }
              ],
              imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
              infoLink: 'https://books.google.com/books?id=gb-123'
            }
          }]
        })
      });

      const result = await resolveIsbn('9780441013593');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Dune');
      expect(result!.source).toBe('google_books');
    });

    it('returns null when both sources fail', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      const result = await resolveIsbn('0000000000');
      expect(result).toBeNull();
    });

    it('returns null for empty ISBN', async () => {
      const result = await resolveIsbn('');
      expect(result).toBeNull();
    });
  });

  describe('isbnResultToApGraph', () => {
    it('converts lookup result into a valid AP graph', () => {
      const result: IsbnLookupResult = {
        title: 'Dune',
        subtitle: 'A Novel',
        description: 'A science fiction masterpiece',
        authors: [{ name: 'Frank Herbert', url: 'https://openlibrary.org/authors/OL456A' }],
        isbn10: '0441013597',
        isbn13: '9780441013593',
        coverUrl: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
        sourceUrl: 'https://openlibrary.org/books/OL123M',
        source: 'openlibrary'
      };

      const graph = isbnResultToApGraph(result, '9780441013593');

      expect(graph.rootId).toContain('isbn:');
      expect(graph.entities.length).toBe(2); // 1 author + 1 edition

      const edition = graph.entities.find((e) => e.kind === 'edition');
      expect(edition).toBeDefined();
      if (edition && edition.kind === 'edition') {
        expect(edition.title).toBe('Dune');
        expect(edition.isbn13).toBe('9780441013593');
        expect(edition.authorIds.length).toBe(1);
      }

      const author = graph.entities.find((e) => e.kind === 'author');
      expect(author).toBeDefined();
      if (author && author.kind === 'author') {
        expect(author.name).toBe('Frank Herbert');
      }
    });

    it('handles books with no authors', () => {
      const result: IsbnLookupResult = {
        title: 'Anonymous Book',
        authors: [],
        isbn13: '9780000000000',
        sourceUrl: 'https://example.com/book',
        source: 'openlibrary'
      };

      const graph = isbnResultToApGraph(result, '9780000000000');
      expect(graph.entities.length).toBe(1); // only edition
      const edition = graph.entities[0];
      if (edition.kind === 'edition') {
        expect(edition.authorIds).toEqual([]);
      }
    });
  });
});
