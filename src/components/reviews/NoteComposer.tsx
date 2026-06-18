/**
 * Phase 29 - NoteComposer component.
 *
 * A lighter-weight annotation/quick-note editor.
 * Notes are always private by default and cannot be published remotely.
 */

import { useTranslation } from 'react-i18next';
import { useReviewComposer } from '../../hooks/useReviewComposer';
import { AdaptiveSheet, AdaptiveButton, AdaptiveTextField } from '../../design/adaptive';
import type { LocalReview } from '../../reviews/types';

export interface NoteComposerProps {
  editionId: string;
  userId: string;
  existingDraftId?: string;
  onClose: () => void;
  onSaved?: (review: LocalReview) => void;
}

export function NoteComposer({
  editionId,
  userId,
  existingDraftId,
  onClose,
  onSaved
}: NoteComposerProps) {
  const { t } = useTranslation();
  const [state, actions] = useReviewComposer({
    editionId,
    userId,
    contentType: 'note',
    existingDraftId,
    onPublished: onSaved,
    onDiscarded: onClose
  });

  // Notes default to private via useReviewComposer; just publish directly
  const handleSave = async () => {
    await actions.publish();
  };

  const canSave = state.content.trim().length > 0 && !state.isPublishing;

  return (
    <AdaptiveSheet
      opened
      onClose={onClose}
      ariaLabel={t('reviews.noteTitle')}
      swipeToClose={!state.isPublishing}
      closeByBackdropClick={!state.isPublishing}
      closeOnEscape={!state.isPublishing}
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
            {t('reviews.noteTitle')}
          </h2>
          <AdaptiveButton
            variant="secondary"
            onClick={() => { actions.discard(); }}
            disabled={state.isPublishing}
            aria-label={t('reviews.discard')}
          >
            {t('reviews.discard')}
          </AdaptiveButton>
        </div>

        {/* Note content */}
        <AdaptiveTextField
          textarea
          value={state.content}
          onChange={(e) => actions.setContent(e.target.value)}
          placeholder={t('reviews.notePlaceholder')}
          disabled={state.isPublishing}
          aria-label={t('reviews.noteContentLabel')}
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck={true}
          {...({ rows: 4 } as any)}
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
            opacity: state.isPublishing ? 0.7 : 1
          }}
        />

        {/* Privacy notice */}
        <p style={{ margin: 0, fontSize: 'var(--text-caption1)', color: 'var(--color-text-tertiary)' }}>
          {t('reviews.notePrivacyNotice')}
        </p>

        {/* Auto-save indicator */}
        {state.lastSavedAt && (
          <p style={{ margin: 0, fontSize: 'var(--text-caption2)', color: 'var(--color-text-tertiary)' }}>
            {t('reviews.autoSaved')}
          </p>
        )}

        {/* Error */}
        {state.error && (
          <p role="alert" style={{ margin: 0, color: 'var(--color-danger)', fontSize: 'var(--text-footnote)' }}>
            {state.error}
          </p>
        )}

        {/* Save button */}
        <AdaptiveButton
          variant="primary"
          onClick={() => { void handleSave(); }}
          disabled={!canSave}
          aria-label={state.isPublishing ? t('reviews.saving') : t('reviews.saveNote')}
        >
          {state.isPublishing ? t('reviews.saving') : t('reviews.saveNote')}
        </AdaptiveButton>
      </section>
    </AdaptiveSheet>
  );
}
