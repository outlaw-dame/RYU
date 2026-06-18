import { describe, expect, it } from 'vitest';
import {
  visibilityToSearchScope,
  canPublishRemotely,
  isLocalOnly,
  isValidVisibility
} from '../visibility';

describe('visibilityToSearchScope', () => {
  it('maps public to public scope', () => {
    expect(visibilityToSearchScope('public')).toBe('public');
  });

  it('maps private to local-only scope', () => {
    expect(visibilityToSearchScope('private')).toBe('local-only');
  });
});

describe('canPublishRemotely', () => {
  it('returns true for public reviews', () => {
    expect(canPublishRemotely('public')).toBe(true);
  });

  it('returns false for private reviews', () => {
    expect(canPublishRemotely('private')).toBe(false);
  });
});

describe('isLocalOnly', () => {
  it('returns true for private content', () => {
    expect(isLocalOnly('private')).toBe(true);
  });

  it('returns false for public content', () => {
    expect(isLocalOnly('public')).toBe(false);
  });
});

describe('isValidVisibility', () => {
  it('accepts public', () => {
    expect(isValidVisibility('public')).toBe(true);
  });

  it('accepts private', () => {
    expect(isValidVisibility('private')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isValidVisibility('unlisted')).toBe(false);
    expect(isValidVisibility('')).toBe(false);
    expect(isValidVisibility('followers')).toBe(false);
  });
});
