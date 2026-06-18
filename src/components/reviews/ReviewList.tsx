/**
 * Phase 29 - ReviewList component.
 *
 * Displays a list of reviews for an edition with edit/delete controls.
 */

import { useTranslation } from 'react-i18next';
import { useEditionReviews } from '../../hooks/useEditionReviews';
import { AppIcon } from '../../design/icons/AppIcon';
import type { LocalReview } from '../../reviews/types';

export interface ReviewListProps {
  editionId: string;
  currentUserId?: string;
  onEdit?: (review: LocalReview) => void;
  onAdd?: () => void;
}

function ReviewItem({
  review,
  isOwner,
  onEdit,
  onDelete
}: {
  review: LocalReview;
  isOwner: boolean;
  onEdit?: (review: LocalReview) => void;
  onDelete?: (reviewId: string) => void;
}) {
  const { t, i18n } = useTranslation();

  const formattedDate = new Date(review.updatedAt).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <article
      style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-bg-secondary)',
        display: 'grid',
        gap: 'var(--space-3)'
      }}
    >
      {/* Header: rating + date + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {review.rating != null && review.rating > 0 && (
            <>
              <div style={{ display: 'flex', gap: 2 }} aria-hidden="true">
                {[1, 2, 3, 4, 5].map((i) => (
                  <AppIcon
                    key={i}
                    name="star"
                    size={16}
                    state={i <= review.rating! ? 'active' : 'subtle'}
                    color={i <= review.rating! ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
                  />
                ))}
              </div>
              <span
                style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-text-secondary)' }}
                aria-label={t('review.rating', { count: review.rating })}
              >
                {review.rating}/5
              </span>
            </>
          )}
          {review.visibility === 'private' && (
            <span
              style={{
                fontSize: 'var(--text-caption2)',
                color: 'var(--color-text-tertiary)',
                background: 'color-mix(in srgb, var(--color-text) 8%, transparent)',
                borderRadius: 'var(--radius-full)',
                padding: '2px var(--space-2)'
              }}
            >
              {t('reviews.private')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <time
            dateTime={review.updatedAt}
            style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-text-tertiary)' }}
          >
            {formattedDate}
          </time>
          {isOwner && (
            <>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(review)}
                  aria-label={t('reviews.edit')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)'
                  }}
                >
                  <AppIcon name="compose" size={16} state="subtle" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(review.id)}
                  aria-label={t('reviews.delete')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--color-danger)'
                  }}
                >
                  <AppIcon name="close" size={16} state="subtle" color="var(--color-danger)" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Title */}
      {review.title && (
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-footnote)',
            fontWeight: 700,
            color: 'var(--color-text)'
          }}
        >
          {review.title}
        </h3>
      )}

      {/* Content */}
      <p
        style={{
          margin: 0,
          fontSize: 'var(--text-footnote)',
          lineHeight: 'var(--leading-footnote)',
          color: 'var(--color-text-secondary)',
          whiteSpace: 'pre-wrap'
        }}
      >
        {review.content}
      </p>
    </article>
  );
}

export function ReviewList({ editionId, currentUserId, onEdit, onAdd }: ReviewListProps) {
  const { t } = useTranslation();
  const { reviews, loading, remove } = useEditionReviews(editionId);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-4)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-footnote)' }}>
        {t('reviews.loading')}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {/* Header with add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--text-subheadline)',
            fontWeight: 700,
            color: 'var(--color-text)'
          }}
        >
          {t('reviews.listTitle')}
        </h2>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={t('reviews.addReview')}
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--color-accent)'
            }}
          >
            <AppIcon name="add" size={20} state="active" color="var(--color-accent)" />
          </button>
        )}
      </div>

      {/* Review items */}
      {reviews.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-footnote)', color: 'var(--color-text-tertiary)' }}>
          {t('reviews.empty')}
        </p>
      ) : (
        reviews.map((review) => (
          <ReviewItem
            key={review.id}
            review={review}
            isOwner={review.userId === currentUserId}
            onEdit={onEdit}
            onDelete={remove}
          />
        ))
      )}
    </div>
  );
}
