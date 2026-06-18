/**
 * Phase 29 - ReviewComposer component.
 *
 * Full-form review editor with content textarea, star rating picker,
 * visibility selector, and save/publish/discard actions.
 */

import { useTranslation } from 'react-i18next';
import { useReviewComposer } from '../../hooks/useReviewComposer';
import { AdaptiveSheet, AdaptiveButton, AdaptiveTextField } from '../../design/adaptive';
import { AppIcon } from '../../design/icons/AppIcon';
import type { ReviewVisibility } from '../../reviews/types';
import type { LocalReview } from '../../reviews/types';

export interface ReviewComposerProps {
  editionId: string;
  userId: string;
  existingDraftId?: string;
  existingReviewId?: string;
  onClose: () => void;
  onPublished?: (review: LocalReview) => void;
}

const VISIBILITY_OPTIONS: { value: ReviewVisibility; labelKey: string; descKey: string }[] = [
  { value: 'public', labelKey: 'reviews.visibilityPublic', descKey: 'reviews.visibilityPublicDesc' },
  { value: 'private', labelKey: 'reviews.visibilityPrivate', descKey: 'reviews.visibilityPrivateDesc' }
];

function StarPicker({ rating, onChange }: { rating: number | null; onChange: (r: number | null) => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('reviews.ratingLabel')}
      style={{ display: 'flex', gap: 4, alignItems: 'center' }}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(rating === star ? null : star)}
          aria-label={t('reviews.starAria', { count: star })}
          aria-pressed={rating !== null && star <= rating}
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            minWidth: 'var(--touch-min)',
            minHeight: 'var(--touch-min)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <AppIcon
            name="star"
            size={24}
            state={rating !== null && star <= rating ? 'active' : 'subtle'}
            color={rating !== null && star <= rating ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
          />
        </button>
      ))}
      {rating !== null && (
        <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)' }}>
          {rating}/5
        </span>
      )}
    </div>
  );
}

export function ReviewComposer({
  editionId,
  userId,
  existingDraftId,
  existingReviewId,
  onClose,
  onPublished
}: ReviewComposerProps) {
  const { t } = useTranslation();
  const [state, actions] = useReviewComposer({
    editionId,
    userId,
    contentType: 'review',
    existingDraftId,
    existingReviewId,
    onPublished,
    onDiscarded: onClose
  });

  const canPublish = state.content.trim().length > 0 && !state.isPublishing;

  return (
    <AdaptiveSheet
      opened
      onClose={onClose}
      ariaLabel={t('reviews.composeTitle')}
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
            {t('reviews.composeTitle')}
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

        {/* Title input */}
        <AdaptiveTextField
          value={state.title}
          onChange={(e) => actions.setTitle(e.target.value)}
          placeholder={t('reviews.titlePlaceholder')}
          disabled={state.isPublishing}
          aria-label={t('reviews.titleLabel')}
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

        {/* Content textarea */}
        <AdaptiveTextField
          textarea
          value={state.content}
          onChange={(e) => actions.setContent(e.target.value)}
          placeholder={t('reviews.contentPlaceholder')}
          disabled={state.isPublishing}
          aria-label={t('reviews.contentLabel')}
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck={true}
          {...({ rows: 6 } as any)}
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

        {/* Rating picker */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--text-caption1)',
              color: 'var(--color-text-tertiary)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-caps)',
              marginBottom: 'var(--space-2)'
            }}
          >
            {t('reviews.ratingLabel')}
          </label>
          <StarPicker rating={state.rating} onChange={actions.setRating} />
        </div>

        {/* Visibility selector */}
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-caption1)',
              color: 'var(--color-text-tertiary)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-caps)'
            }}
          >
            {t('reviews.visibilityLabel')}
          </legend>
          <div role="radiogroup" aria-label={t('reviews.visibilityLabel')} style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {VISIBILITY_OPTIONS.map(({ value, labelKey, descKey }) => {
              const active = state.visibility === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${t(labelKey)}: ${t(descKey)}`}
                  onClick={() => actions.setVisibility(value)}
                  disabled={state.isPublishing}
                  style={{
                    flex: 1,
                    minHeight: 'calc(var(--touch-min) - 8px)',
                    border: active
                      ? '1px solid color-mix(in srgb, var(--color-accent) 60%, transparent)'
                      : '1px solid color-mix(in srgb, var(--color-text) 14%, transparent)',
                    borderRadius: 'var(--radius-md)',
                    background: active
                      ? 'color-mix(in srgb, var(--color-accent) 14%, var(--color-bg))'
                      : 'var(--color-bg-secondary)',
                    color: 'var(--color-text)',
                    fontSize: 'var(--text-footnote)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    opacity: state.isPublishing ? 0.6 : 1
                  }}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </fieldset>

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

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <AdaptiveButton
            variant="secondary"
            onClick={() => { actions.saveDraft(); }}
            disabled={state.isPublishing || !state.isDirty}
          >
            {t('reviews.saveDraft')}
          </AdaptiveButton>
          <AdaptiveButton
            variant="primary"
            onClick={() => { void actions.publish(); }}
            disabled={!canPublish}
            aria-label={state.isPublishing ? t('reviews.publishing') : t('reviews.publish')}
          >
            {state.isPublishing ? t('reviews.publishing') : t('reviews.publish')}
          </AdaptiveButton>
        </div>
      </section>
    </AdaptiveSheet>
  );
}
