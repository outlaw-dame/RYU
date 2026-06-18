import { describe, expect, it } from 'vitest';
import {
  normalizeForComparison,
  parseAuthorName,
  canonicalizeAuthorName,
  compareAuthorNames,
  findAuthorAliases
} from '../author-normalizer';

describe('author-normalizer', () => {
  describe('normalizeForComparison', () => {
    it('lowercases and trims', () => {
      expect(normalizeForComparison('  Hello World  ')).toBe('hello world');
    });

    it('strips punctuation', () => {
      expect(normalizeForComparison("O'Brien")).toBe('obrien');
    });

    it('collapses whitespace', () => {
      expect(normalizeForComparison('John   Smith')).toBe('john smith');
    });

    it('normalizes unicode', () => {
      // NFKC normalization
      expect(normalizeForComparison('\u00e9')).toBe(normalizeForComparison('e\u0301'));
    });
  });

  describe('parseAuthorName', () => {
    it('parses "First Last" format', () => {
      expect(parseAuthorName('Frank Herbert')).toEqual({
        given: ['Frank'],
        family: 'Herbert'
      });
    });

    it('parses "First Middle Last" format', () => {
      expect(parseAuthorName('Ursula Kroeber Le Guin')).toEqual({
        given: ['Ursula', 'Kroeber', 'Le'],
        family: 'Guin'
      });
    });

    it('parses "Last, First" format', () => {
      expect(parseAuthorName('Herbert, Frank')).toEqual({
        given: ['Frank'],
        family: 'Herbert'
      });
    });

    it('parses "Last, First Middle" format', () => {
      expect(parseAuthorName('Herbert, Frank Patrick')).toEqual({
        given: ['Frank', 'Patrick'],
        family: 'Herbert'
      });
    });

    it('handles single name', () => {
      expect(parseAuthorName('Plato')).toEqual({
        given: [],
        family: 'Plato'
      });
    });

    it('handles empty string', () => {
      expect(parseAuthorName('')).toEqual({
        given: [],
        family: ''
      });
    });
  });

  describe('canonicalizeAuthorName', () => {
    it('converts "First Last" to "last, first"', () => {
      expect(canonicalizeAuthorName('Frank Herbert')).toBe('herbert, frank');
    });

    it('normalizes "Last, First" to same form', () => {
      expect(canonicalizeAuthorName('Herbert, Frank')).toBe('herbert, frank');
    });

    it('handles single name', () => {
      expect(canonicalizeAuthorName('Plato')).toBe('plato');
    });
  });

  describe('compareAuthorNames', () => {
    it('returns 1.0 for exact canonical match', () => {
      expect(compareAuthorNames('Frank Herbert', 'Herbert, Frank')).toBe(1.0);
    });

    it('returns 1.0 for identical names', () => {
      expect(compareAuthorNames('Frank Herbert', 'Frank Herbert')).toBe(1.0);
    });

    it('returns 0.85 for initial matching', () => {
      expect(compareAuthorNames('F Herbert', 'Frank Herbert')).toBe(0.85);
    });

    it('returns 0.7 when one side has no given names', () => {
      expect(compareAuthorNames('Herbert', 'Frank Herbert')).toBe(0.7);
    });

    it('returns 0.0 for completely different names', () => {
      expect(compareAuthorNames('Frank Herbert', 'Isaac Asimov')).toBe(0.0);
    });

    it('returns 0.0 for different family names', () => {
      expect(compareAuthorNames('Frank Herbert', 'Frank Asimov')).toBe(0.0);
    });

    it('handles "Last, F" vs "Last, First"', () => {
      expect(compareAuthorNames('Herbert, F', 'Herbert, Frank')).toBe(0.85);
    });

    it('returns 0.6 for partial given name overlap', () => {
      expect(compareAuthorNames('John Ronald Reuel Tolkien', 'John Xavier Tolkien')).toBe(0.6);
    });

    it('returns 0.3 for same family but different given names', () => {
      expect(compareAuthorNames('Alice Herbert', 'Frank Herbert')).toBe(0.3);
    });
  });

  describe('findAuthorAliases', () => {
    it('returns empty array when no aliases found', () => {
      const authors = [
        { id: '1', name: 'Frank Herbert' },
        { id: '2', name: 'Isaac Asimov' }
      ];
      expect(findAuthorAliases(authors)).toEqual([]);
    });

    it('finds canonical name variations', () => {
      const authors = [
        { id: '1', name: 'Frank Herbert' },
        { id: '2', name: 'Herbert, Frank' }
      ];
      const result = findAuthorAliases(authors);
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(1.0);
      expect(result[0].idA).toBe('1');
      expect(result[0].idB).toBe('2');
    });

    it('finds initial-based aliases', () => {
      const authors = [
        { id: '1', name: 'F. Herbert' },
        { id: '2', name: 'Frank Herbert' }
      ];
      const result = findAuthorAliases(authors);
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.85);
    });

    it('respects threshold parameter', () => {
      const authors = [
        { id: '1', name: 'Herbert' },
        { id: '2', name: 'Frank Herbert' }
      ];
      // Default threshold of 0.7 should include this (confidence = 0.7)
      expect(findAuthorAliases(authors, 0.7)).toHaveLength(1);
      // Higher threshold should exclude it
      expect(findAuthorAliases(authors, 0.8)).toHaveLength(0);
    });

    it('sorts results by confidence descending', () => {
      const authors = [
        { id: '1', name: 'Frank Herbert' },
        { id: '2', name: 'Herbert, Frank' },
        { id: '3', name: 'F Herbert' }
      ];
      const result = findAuthorAliases(authors);
      expect(result.length).toBeGreaterThan(1);
      // All results should be sorted by confidence descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
      }
    });
  });
});
