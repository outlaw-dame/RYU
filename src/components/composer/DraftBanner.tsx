/**
 * Phase 32 - Draft banner component.
 *
 * Shows an indicator when the composer has an unsaved draft being restored,
 * with the last auto-save timestamp.
 */

import { useTranslation } from 'react-i18next';

export interface DraftBannerProps {
  /** ISO timestamp of last save, null if no draft */
  savedAt: string | null;
  /** Whether the content has unsaved changes */
  isDirty: boolean;
}

export function DraftBanner({ savedAt, isDirty }: DraftBannerProps) {
  const { t } = useTranslation();

  if (!savedAt && !isDirty) {
    return null;
  }

  const message = isDirty
    ? t('composer.draft.unsaved')
    : t('composer.draft.restored');

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))',
        border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
        fontSize: 'var(--text-caption1)',
        color: 'var(--color-text-secondary)'
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 'var(--text-footnote)' }}>
        {isDirty ? '\u270F' : '\u2713'}
      </span>
      <span>{message}</span>
    </div>
  );
}
