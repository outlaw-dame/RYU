/**
 * Phase 32 - Character counter component.
 *
 * Displays remaining character count with color-coded feedback:
 * - Normal (tertiary text) when well under limit
 * - Warning (rating/amber) when approaching limit
 * - Danger (red) when at or over limit
 */

import { COMPOSER_LIMITS } from '../../composer';

export interface CharacterCounterProps {
  /** Current text length */
  current: number;
  /** Maximum allowed length */
  max: number;
}

export function CharacterCounter({ current, max }: CharacterCounterProps) {
  const remaining = max - current;
  const warnAt = Math.floor(max * COMPOSER_LIMITS.WARN_THRESHOLD);

  const color =
    remaining < 0
      ? 'var(--color-danger)'
      : current >= warnAt
        ? 'var(--color-rating)'
        : 'var(--color-text-tertiary)';

  return (
    <span
      aria-live="polite"
      aria-atomic="true"
      style={{
        fontSize: 'var(--text-caption1)',
        color,
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {remaining}
    </span>
  );
}
