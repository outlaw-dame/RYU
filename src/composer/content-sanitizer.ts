/**
 * Phase 32 - Content sanitizer.
 *
 * Input sanitization for composer content:
 * - Strips dangerous HTML tags and attributes
 * - Validates length constraints
 * - Escapes special characters for safe rendering
 * - Enforces content warning rules
 */

import { COMPOSER_LIMITS, type ComposerValidation, type ComposerValidationError, type ComposerMode, type ContentWarning } from './types';

/**
 * HTML tags that are never allowed in user-generated content.
 */
const DANGEROUS_TAGS_RE = /<\s*\/?\s*(script|iframe|object|embed|link|style|meta|base|form|input|button)\b[^>]*>/gi;

/**
 * Event handler attributes (onclick, onerror, etc.).
 */
const EVENT_ATTRS_RE = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * JavaScript URLs in href/src (captures the full attribute value).
 */
const JS_URL_RE = /(href|src|action)\s*=\s*(?:"[^"]*javascript\s*:[^"]*"|'[^']*javascript\s*:[^']*'|[^\s>]*javascript\s*:[^\s>]*)/gi;

/**
 * Strips dangerous HTML from text content.
 * Removes script/iframe/object tags, event handler attributes, and javascript: URLs.
 */
export function stripDangerousHtml(input: string): string {
  let result = input;
  result = result.replace(DANGEROUS_TAGS_RE, '');
  result = result.replace(EVENT_ATTRS_RE, '');
  result = result.replace(JS_URL_RE, '');
  return result;
}

/**
 * Escapes HTML special characters for safe text display.
 * Use for plain-text contexts where no HTML rendering is intended.
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
 * Applies all sanitization rules in order.
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
