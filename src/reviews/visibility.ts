/**
 * Phase 29 - Visibility rules.
 *
 * Enforces privacy boundaries:
 * - Private content stays local-only and never leaves the device.
 * - Public content can be queued for remote publishing.
 */

import type { SearchDocumentScope } from '../search/types';
import type { ReviewVisibility } from './types';

/**
 * Maps a review's visibility to the appropriate search document scope.
 * Private reviews are indexed as 'local-only' so they never appear in
 * shared or federated surfaces.
 */
export function visibilityToSearchScope(visibility: ReviewVisibility): SearchDocumentScope {
  switch (visibility) {
    case 'public':
      return 'public';
    case 'private':
      return 'local-only';
    default:
      return 'local-only';
  }
}

/**
 * Returns true if the review can be queued for remote publishing.
 * Only public reviews are eligible.
 */
export function canPublishRemotely(visibility: ReviewVisibility): boolean {
  return visibility === 'public';
}

/**
 * Returns true if the content must never leave the local device.
 */
export function isLocalOnly(visibility: ReviewVisibility): boolean {
  return visibility === 'private';
}

/**
 * Validates that a visibility value is one of the allowed options.
 */
export function isValidVisibility(value: string): value is ReviewVisibility {
  return value === 'public' || value === 'private';
}
