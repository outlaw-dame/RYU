/**
 * Phase 32 - Composer module barrel exports.
 */

export type {
  ComposerMode,
  VisibilityOption,
  ContentWarning,
  AttachmentRef,
  DraftContent,
  VisibilityOptionDescriptor,
  ComposerValidation,
  ComposerValidationError
} from './types';

export { COMPOSER_LIMITS } from './types';

export {
  createInitialState,
  transition,
  isEditable,
  canRequestPublish,
  isPublishing
} from './composer-state';

export type {
  ComposerPhase,
  ComposerEvent,
  ComposerState
} from './composer-state';

export {
  stripDangerousHtml,
  escapeHtml,
  normalizeWhitespace,
  sanitizeContent,
  getMaxLength,
  validateContent
} from './content-sanitizer';

export {
  VISIBILITY_OPTIONS,
  getDefaultVisibility,
  isValidVisibility,
  toMastodonVisibility,
  fromMastodonVisibility,
  getVisibilityDescriptor,
  isPubliclyVisible,
  canQueueForPublishing
} from './visibility-picker';
