/**
 * Phase 32 - Visibility picker logic.
 *
 * Provides the set of visibility options with i18n-ready labels and descriptions.
 * Maps between Mastodon API visibility values and human-friendly descriptions.
 */

import type { VisibilityOption, VisibilityOptionDescriptor } from './types';

/**
 * All supported visibility options with i18n keys and icon references.
 */
export const VISIBILITY_OPTIONS: VisibilityOptionDescriptor[] = [
  {
    value: 'public',
    labelKey: 'composer.visibility.public',
    descriptionKey: 'composer.visibility.publicDesc',
    iconName: 'globe'
  },
  {
    value: 'unlisted',
    labelKey: 'composer.visibility.unlisted',
    descriptionKey: 'composer.visibility.unlistedDesc',
    iconName: 'lock.open'
  },
  {
    value: 'followers_only',
    labelKey: 'composer.visibility.followersOnly',
    descriptionKey: 'composer.visibility.followersOnlyDesc',
    iconName: 'person.2'
  },
  {
    value: 'direct',
    labelKey: 'composer.visibility.direct',
    descriptionKey: 'composer.visibility.directDesc',
    iconName: 'envelope'
  }
];

/**
 * Returns the default visibility for a new compose session.
 */
export function getDefaultVisibility(): VisibilityOption {
  return 'public';
}

/**
 * Validates that a string is a valid visibility option.
 */
export function isValidVisibility(value: string): value is VisibilityOption {
  return value === 'public' || value === 'unlisted' || value === 'followers_only' || value === 'direct';
}

/**
 * Maps the internal visibility value to the Mastodon API format.
 * Mastodon uses 'private' for followers-only posts.
 */
export function toMastodonVisibility(option: VisibilityOption): string {
  switch (option) {
    case 'public':
      return 'public';
    case 'unlisted':
      return 'unlisted';
    case 'followers_only':
      return 'private';
    case 'direct':
      return 'direct';
  }
}

/**
 * Maps a Mastodon API visibility value to the internal representation.
 */
export function fromMastodonVisibility(mastodonValue: string): VisibilityOption {
  switch (mastodonValue) {
    case 'public':
      return 'public';
    case 'unlisted':
      return 'unlisted';
    case 'private':
      return 'followers_only';
    case 'direct':
      return 'direct';
    default:
      return 'public';
  }
}

/**
 * Returns the descriptor for a specific visibility option.
 */
export function getVisibilityDescriptor(option: VisibilityOption): VisibilityOptionDescriptor {
  return VISIBILITY_OPTIONS.find((o) => o.value === option) ?? VISIBILITY_OPTIONS[0];
}

/**
 * Returns true if the visibility allows the post to appear in public timelines.
 */
export function isPubliclyVisible(option: VisibilityOption): boolean {
  return option === 'public';
}

/**
 * Returns true if the content can be queued for remote publishing.
 * Only public and unlisted posts can be published remotely.
 * Direct messages and followers-only posts require an active session.
 */
export function canQueueForPublishing(option: VisibilityOption): boolean {
  return option === 'public' || option === 'unlisted' || option === 'followers_only' || option === 'direct';
}
