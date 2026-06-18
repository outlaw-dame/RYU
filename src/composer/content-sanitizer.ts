/**
 * Phase 32 - Content sanitizer.
 *
 * Input sanitization for composer content:
 * - Uses DOMPurify for battle-tested HTML sanitization (no regex-based bypass)
 * - Validates length constraints
 * - Escapes special characters for safe rendering
 * - Enforces content warning rules
 *
 * SECURITY: The composer produces plain text for Mastodon/BookWyrm statuses.
 * All HTML is escaped (not stripped) because the ActivityPub spec expects
 * plain text in status fields. DOMPurify is used as a defense-in-depth
 * layer for any future rich-text paths.
 */

import DOMPurify from 'dompurify';
import { COMPOSER_LIMITS, type ComposerValidation, type ComposerValidationError, type ComposerMode, type ContentWarning } from './types';

/**
 * Escapes HTML special characters for safe text display.
 * Use for plain-text contexts where no HTML rendering is intended.
 * This is the PRIMARY sanitization for the composer — all content
 * is treated as plain text.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Strips ALL HTML from input using DOMPurify with an empty allow-list.
 * Returns only the text content. Used as defense-in-depth for any
 * path where HTML might be inadvertently introduced.
 */
export function stripDangerousHtml(input: string): string {
  if (typeof window === 'undefined') {
    // SSR/test fallback: escape all HTML entities
    return escapeHtml(input);
  }
  // DOMPurify with ALLOWED_TAGS=[] strips all HTML, returning only text content
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Normalizes whitespace in text content:
 * - Collapses multiple consecutive newlines to max 2
 * - Trims leading/trailing whitespace
 * - Removes zero-width characters used for text manipulation attacks
 */
export function normalizeWhitespace(input: string): string {
  let result = input;
  // Remove zero-width characters (U+200B, U+200C, U+200D, U+FEFF, U+2060)
  result = result.replace(/[\u200B\u200C\u200D\uFEFF\u2060]/g, '');
  // Collapse 3+ consecutive newlines to 2
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

/**
 * Sanitizes composer text content.
 * For the composer, content is treated as PLAIN TEXT:
 * 1. Strip any HTML that might have been pasted
 * 2. Normalize whitespace
 * The result is safe for embedding in status payloads.
 */
export function sanitizeContent(input: string): string {
  let result = stripDangerousHtml(input);
  result = normalizeWhitespace(result);
  return result;
}

/**
 * Returns the max character length for a given composer mode.
 */
export function getMaxLength(mode: ComposerMode): number {
  switch (mode) {
    case 'review':
      return COMPOSER_LIMITS.REVIEW_MAX_LENGTH;
    case 'status':
    case 'reply':
      return COMPOSER_LIMITS.STATUS_MAX_LENGTH;
  }
}

/**
 * Validates composer content against all rules.
 * Returns a validation result with any errors found.
 */
export function validateContent(input: {
  mode: ComposerMode;
  text: string;
  title: string;
  contentWarning: ContentWarning;
  attachmentCount: number;
}): ComposerValidation {
  const errors: ComposerValidationError[] = [];
  const maxLength = getMaxLength(input.mode);

  // Text validation
  if (input.text.trim().length === 0) {
    errors.push({ field: 'text', messageKey: 'composer.errors.textRequired' });
  } else if (input.text.length > maxLength) {
    errors.push({ field: 'text', messageKey: 'composer.errors.textTooLong' });
  }

  // Title validation (only for review mode)
  if (input.mode === 'review' && input.title.length > COMPOSER_LIMITS.TITLE_MAX_LENGTH) {
    errors.push({ field: 'title', messageKey: 'composer.errors.titleTooLong' });
  }

  // Content warning validation
  if (input.contentWarning.enabled && input.contentWarning.text.trim().length === 0) {
    errors.push({ field: 'contentWarning', messageKey: 'composer.errors.cwRequired' });
  } else if (input.contentWarning.text.length > COMPOSER_LIMITS.CW_MAX_LENGTH) {
    errors.push({ field: 'contentWarning', messageKey: 'composer.errors.cwTooLong' });
  }

  // Attachment validation
  if (input.attachmentCount > COMPOSER_LIMITS.MAX_ATTACHMENTS) {
    errors.push({ field: 'attachments', messageKey: 'composer.errors.tooManyAttachments' });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
