import { describe, it, expect } from 'vitest';
import {
  VISIBILITY_OPTIONS,
  getDefaultVisibility,
  isValidVisibility,
  toMastodonVisibility,
  fromMastodonVisibility,
  getVisibilityDescriptor,
  isPubliclyVisible,
  canQueueForPublishing
} from '../visibility-picker';

describe('visibility-picker', () => {
  describe('VISIBILITY_OPTIONS', () => {
    it('has 4 options', () => {
      expect(VISIBILITY_OPTIONS).toHaveLength(4);
    });

    it('each option has required fields', () => {
      for (const opt of VISIBILITY_OPTIONS) {
        expect(opt.value).toBeTruthy();
        expect(opt.labelKey).toBeTruthy();
        expect(opt.descriptionKey).toBeTruthy();
        expect(opt.iconName).toBeTruthy();
      }
    });
  });

  describe('getDefaultVisibility', () => {
    it('returns public', () => {
      expect(getDefaultVisibility()).toBe('public');
    });
  });

  describe('isValidVisibility', () => {
    it('returns true for valid values', () => {
      expect(isValidVisibility('public')).toBe(true);
      expect(isValidVisibility('unlisted')).toBe(true);
      expect(isValidVisibility('followers_only')).toBe(true);
      expect(isValidVisibility('direct')).toBe(true);
    });

    it('returns false for invalid values', () => {
      expect(isValidVisibility('invalid')).toBe(false);
      expect(isValidVisibility('')).toBe(false);
      expect(isValidVisibility('private')).toBe(false);
    });
  });

  describe('toMastodonVisibility', () => {
    it('maps internal values to Mastodon API values', () => {
      expect(toMastodonVisibility('public')).toBe('public');
      expect(toMastodonVisibility('unlisted')).toBe('unlisted');
      expect(toMastodonVisibility('followers_only')).toBe('private');
      expect(toMastodonVisibility('direct')).toBe('direct');
    });
  });

  describe('fromMastodonVisibility', () => {
    it('maps Mastodon API values to internal values', () => {
      expect(fromMastodonVisibility('public')).toBe('public');
      expect(fromMastodonVisibility('unlisted')).toBe('unlisted');
      expect(fromMastodonVisibility('private')).toBe('followers_only');
      expect(fromMastodonVisibility('direct')).toBe('direct');
    });

    it('defaults to public for unknown values', () => {
      expect(fromMastodonVisibility('unknown')).toBe('public');
    });
  });

  describe('getVisibilityDescriptor', () => {
    it('returns the correct descriptor for each option', () => {
      const desc = getVisibilityDescriptor('public');
      expect(desc.value).toBe('public');
      expect(desc.labelKey).toBe('composer.visibility.public');
    });

    it('defaults to first option for unknown values', () => {
      const desc = getVisibilityDescriptor('unknown' as any);
      expect(desc.value).toBe('public');
    });
  });

  describe('isPubliclyVisible', () => {
    it('returns true only for public', () => {
      expect(isPubliclyVisible('public')).toBe(true);
      expect(isPubliclyVisible('unlisted')).toBe(false);
      expect(isPubliclyVisible('followers_only')).toBe(false);
      expect(isPubliclyVisible('direct')).toBe(false);
    });
  });

  describe('canQueueForPublishing', () => {
    it('returns true for all valid options', () => {
      expect(canQueueForPublishing('public')).toBe(true);
      expect(canQueueForPublishing('unlisted')).toBe(true);
      expect(canQueueForPublishing('followers_only')).toBe(true);
      expect(canQueueForPublishing('direct')).toBe(true);
    });
  });
});
