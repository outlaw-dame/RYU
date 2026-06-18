/**
 * Phase 32 - Unified composer component.
 *
 * Handles all compose modes (status posts, reviews, replies) with:
 * - Text area with character count
 * - Visibility picker with explicit descriptions
 * - Content warning toggle and input
 * - Draft restoration banner
 * - Save draft / Publish actions
 * - Accessible keyboard and screen-reader support
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AdaptiveSheet, AdaptiveButton, AdaptiveTextField } from '../../design/adaptive';
import { type ComposerMode, type VisibilityOption, type ContentWarning, getMaxLength } from '../../composer';
import { CharacterCounter } from './CharacterCounter';
import { ContentWarningInput } from './ContentWarningInput';
import { DraftBanner } from './DraftBanner';
import { VisibilityPicker } from './VisibilityPicker';

export interface UnifiedComposerProps {
  /** Composer mode determines layout and character limits */
  mode: ComposerMode;
  /** Current text content */
  text: string;
  onTextChange: (text: string) => void;
  /** Title (visible only in review mode) */
  title: string;
  onTitleChange: (title: string) => void;
  /** Visibility setting */
  visibility: VisibilityOption;
  onVisibilityChange: (visibility: VisibilityOption) => void;
  /** Content warning state */
  contentWarning: ContentWarning;
  onContentWarningChange: (cw: ContentWarning) => void;
  /** Draft state */
  isDirty: boolean;
  lastSavedAt: string | null;
  /** Publishing state */
  isPublishing: boolean;
  /** Error message from last action */
  error: string | null;
  /** Callbacks */
  onPublish: () => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onClose: () => void;
  /** Whether publish is allowed */
  canPublish: boolean;
  /** Whether save draft is allowed */
  canSaveDraft: boolean;
}

function getModeTitle(mode: ComposerMode): string {
  switch (mode) {
    case 'status': return 'composer.title.status';
    case 'review': return 'composer.title.review';
    case 'reply': return 'composer.title.reply';
  }
}

function getTextPlaceholder(mode: ComposerMode): string {
  switch (mode) {
    case 'status': return 'composer.placeholder.status';
    case 'review': return 'composer.placeholder.review';
    case 'reply': return 'composer.placeholder.reply';
  }
}

export function UnifiedComposer({
  mode,
  text,
  onTextChange,
  title,
  onTitleChange,
  visibility,
  onVisibilityChange,
  contentWarning,
  onContentWarningChange,
  isDirty,
  lastSavedAt,
  isPublishing,
  error,
  onPublish,
  onSaveDraft,
  onDiscard,
  onClose,
  canPublish,
  canSaveDraft
}: UnifiedComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxLength = getMaxLength(mode);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <AdaptiveSheet
      opened
      onClose={onClose}
      ariaLabel={t(getModeTitle(mode))}
      swipeToClose={!isPublishing}
      closeByBackdropClick={!isPublishing}
      closeOnEscape={!isPublishing}
    >
      <section
        style={{
          padding: 'var(--space-5) var(--space-4) 0',
          display: 'grid',
          gap: 'var(--space-4)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-headline)',
              fontWeight: 700,
              color: 'var(--color-text)'
            }}
          >
            {t(getModeTitle(mode))}
          </h2>
          <AdaptiveButton
            variant="secondary"
            onClick={onClose}
            disabled={isPublishing}
            aria-label={t('composer.cancel')}
            className="compose-cancel-btn"
          >
            {t('composer.cancel')}
          </AdaptiveButton>
        </div>

        {/* Draft banner */}
        <DraftBanner savedAt={lastSavedAt} isDirty={isDirty} />

        {/* Content warning */}
        <ContentWarningInput
          value={contentWarning}
          onChange={onContentWarningChange}
          disabled={isPublishing}
        />

        {/* Title input (review mode only) */}
        {mode === 'review' && (
          <AdaptiveTextField
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t('composer.titlePlaceholder')}
            disabled={isPublishing}
            aria-label={t('composer.titleLabel')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid color-mix(in srgb, var(--color-text) 14%, transparent)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              padding: 'var(--space-3) var(--space-4)',
              outline: 'none'
            }}
          />
        )}

        {/* Text area */}
        <AdaptiveTextField
          ref={textareaRef}
          textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={t(getTextPlaceholder(mode))}
          disabled={isPublishing}
          aria-label={t('composer.textLabel')}
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck={true}
          enterKeyHint="done"
          {...({ rows: mode === 'review' ? 6 : 4 } as any)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'none',
            border: '1px solid color-mix(in srgb, var(--color-text) 14%, transparent)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--leading-body)',
            padding: 'var(--space-3) var(--space-4)',
            outline: 'none',
            opacity: isPublishing ? 0.7 : 1
          }}
        />

        {/* Character counter */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'calc(-1 * var(--space-3))' }}>
          <CharacterCounter current={text.length} max={maxLength} />
        </div>

        {/* Visibility picker */}
        <VisibilityPicker
          value={visibility}
          onChange={onVisibilityChange}
          disabled={isPublishing}
        />

        {/* Error */}
        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              color: 'var(--color-danger)',
              fontSize: 'var(--text-footnote)',
              lineHeight: 'var(--leading-footnote)'
            }}
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', paddingBottom: 'var(--space-4)' }}>
          <AdaptiveButton
            variant="secondary"
            onClick={onSaveDraft}
            disabled={isPublishing || !canSaveDraft}
            aria-label={t('composer.saveDraft')}
          >
            {t('composer.saveDraft')}
          </AdaptiveButton>
          <AdaptiveButton
            variant="secondary"
            onClick={onDiscard}
            disabled={isPublishing}
            aria-label={t('composer.discard')}
          >
            {t('composer.discard')}
          </AdaptiveButton>
          <AdaptiveButton
            variant="primary"
            onClick={onPublish}
            disabled={!canPublish || isPublishing}
            aria-label={isPublishing ? t('composer.publishing') : t('composer.publish')}
          >
            {isPublishing ? t('composer.publishing') : t('composer.publish')}
          </AdaptiveButton>
        </div>
      </section>
    </AdaptiveSheet>
  );
}
