/**
 * Phase 32 - Visibility picker component.
 *
 * Uses native radio inputs (visually hidden) with labels for
 * correct keyboard navigation and screen reader support.
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {VISIBILITY_OPTIONS.map(({ value: optValue, labelKey, descriptionKey }) => {
          const active = value === optValue;
          const inputId = `visibility-${optValue}`;
          return (
            <label
              key={optValue}
              htmlFor={inputId}
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
                padding: 'var(--space-2) var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <input
                type="radio"
                id={inputId}
                name="composer-visibility"
                value={optValue}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(optValue)}
                aria-describedby={`visibility-desc-${optValue}`}
                style={{
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  padding: 0,
                  margin: '-1px',
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: 0
                }}
              />
              <span>{t(labelKey)}</span>
              <span id={`visibility-desc-${optValue}`} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                {t(descriptionKey)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
