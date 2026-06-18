/**
 * Phase 32 - Content warning input component.
 *
 * Provides a toggle button to enable/disable the CW field,
 * and a text input for the spoiler/warning summary when enabled.
 */

import { useTranslation } from 'react-i18next';
import { AdaptiveTextField } from '../../design/adaptive';
import type { ContentWarning } from '../../composer';
import { COMPOSER_LIMITS } from '../../composer';

export interface ContentWarningInputProps {
  value: ContentWarning;
  onChange: (cw: ContentWarning) => void;
  disabled?: boolean;
}

export function ContentWarningInput({ value, onChange, disabled }: ContentWarningInputProps) {
  const { t } = useTranslation();

  function handleToggle() {
    onChange({ enabled: !value.enabled, text: value.text });
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange({ enabled: value.enabled, text: e.target.value });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-pressed={value.enabled}
        aria-label={t('composer.cw.toggle')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          border: value.enabled
            ? '1px solid color-mix(in srgb, var(--color-accent) 60%, transparent)'
            : '1px solid color-mix(in srgb, var(--color-text) 14%, transparent)',
          borderRadius: 'var(--radius-full)',
          background: value.enabled
            ? 'color-mix(in srgb, var(--color-accent) 14%, var(--color-bg))'
            : 'var(--color-bg-secondary)',
          color: 'var(--color-text)',
          fontSize: 'var(--text-caption1)',
          fontWeight: 600,
          padding: '4px var(--space-3)',
          cursor: 'pointer',
          opacity: disabled ? 0.6 : 1,
          alignSelf: 'flex-start'
        }}
      >
        CW
      </button>

      {value.enabled && (
        <AdaptiveTextField
          value={value.text}
          onChange={handleTextChange}
          placeholder={t('composer.cw.placeholder')}
          disabled={disabled}
          aria-label={t('composer.cw.label')}
          maxLength={COMPOSER_LIMITS.CW_MAX_LENGTH}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid color-mix(in srgb, var(--color-text) 14%, transparent)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-footnote)',
            padding: 'var(--space-2) var(--space-3)',
            outline: 'none'
          }}
        />
      )}
    </div>
  );
}
