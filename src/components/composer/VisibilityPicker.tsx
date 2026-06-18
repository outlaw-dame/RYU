/**
 * Phase 32 - Visibility picker component.
 *
 * Dropdown/radio-group for selecting post visibility.
 * Each option shows a label and human-readable description.
 */

import { useTranslation } from 'react-i18next';
import { VISIBILITY_OPTIONS, type VisibilityOption } from '../../composer';

export interface VisibilityPickerProps {
  value: VisibilityOption;
  onChange: (visibility: VisibilityOption) => void;
  disabled?: boolean;
}

export function VisibilityPicker({ value, onChange, disabled }: VisibilityPickerProps) {
  const { t } = useTranslation();

  return (
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
        {t('composer.visibility.label')}
      </legend>
      <div
        role="radiogroup"
        aria-label={t('composer.visibility.label')}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
      >
        {VISIBILITY_OPTIONS.map(({ value: optValue, labelKey, descriptionKey }) => {
          const active = value === optValue;
          return (
            <button
              key={optValue}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${t(labelKey)}: ${t(descriptionKey)}`}
              onClick={() => onChange(optValue)}
              disabled={disabled}
              style={{
                flex: '1 1 auto',
                minWidth: '80px',
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
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                padding: 'var(--space-2) var(--space-3)'
              }}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
