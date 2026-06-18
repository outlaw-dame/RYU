/**
 * Phase 32 - Unified composer type definitions.
 *
 * Defines domain types for the composer workflow including modes,
 * draft content, visibility options, content warnings, and attachments.
 */

/**
 * Composer mode determines the UI layout and publish behaviour:
 * - status: freeform Mastodon/BookWyrm status post
 * - review: book review with title, content, rating
 * - reply: reply to an existing status (includes in_reply_to_id)
 */
export type ComposerMode = 'status' | 'review' | 'reply';

/**
 * Visibility options for published content.
 * Maps to the Mastodon/BookWyrm visibility model.
 */
export type VisibilityOption = 'public' | 'unlisted' | 'followers_only' | 'direct';

/**
 * Content warning (CW / spoiler text) state.
 */
export interface ContentWarning {
  enabled: boolean;
  text: string;
}

/**
 * Reference to an attachment (image, cover art, etc.) queued for upload.
 */
export interface AttachmentRef {
  id: string;
  /** Local object URL or data URI for preview */
  previewUrl: string;
  /** MIME type */
  mimeType: string;
  /** File name */
  fileName: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Description / alt text for accessibility */
  altText: string;
}

/**
 * Draft content persisted by the composer.
 */
export interface DraftContent {
  id: string;
  mode: ComposerMode;
  text: string;
  title: string;
  visibility: VisibilityOption;
  contentWarning: ContentWarning;
  attachments: AttachmentRef[];
  /** For reply mode: the status ID being replied to */
  inReplyToId: string | null;
  /** For review mode: the edition being reviewed */
  editionId: string | null;
  /** For review mode: star rating (1-5 or null) */
  rating: number | null;
  /** ISO timestamp of last save */
  savedAt: string;
  /** User ID that owns this draft */
  userId: string;
}

/**
 * Visibility option with human-readable metadata for the picker UI.
 */
export interface VisibilityOptionDescriptor {
  value: VisibilityOption;
  labelKey: string;
  descriptionKey: string;
  iconName: string;
}

/**
 * Validation result for composer content.
 */
export interface ComposerValidation {
  valid: boolean;
  errors: ComposerValidationError[];
}

export interface ComposerValidationError {
  field: 'text' | 'title' | 'contentWarning' | 'attachments';
  messageKey: string;
}

/**
 * Character limit configuration.
 */
export const COMPOSER_LIMITS = {
  /** Max characters for status/reply text */
  STATUS_MAX_LENGTH: 500,
  /** Max characters for review content */
  REVIEW_MAX_LENGTH: 5000,
  /** Max characters for review title */
  TITLE_MAX_LENGTH: 200,
  /** Max characters for content warning text */
  CW_MAX_LENGTH: 100,
  /** Max number of attachments */
  MAX_ATTACHMENTS: 4,
  /** Warning threshold (percentage of max before warning) */
  WARN_THRESHOLD: 0.9
} as const;
