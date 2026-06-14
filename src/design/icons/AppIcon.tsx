/**
 * AppIcon Component
 * Semantic icon wrapper that abstracts the underlying icon library.
 * Currently uses Iconoir — swappable without changing consuming code.
 */

import React, { forwardRef } from "react";
import { getIconComponent, type AppIconName } from "./iconMap";

export interface AppIconProps {
  name: AppIconName;
  /** Size in pixels (applied to both width and height) */
  size?: number;
  /** Stroke/fill color */
  color?: string;
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Accessibility label — when provided, sets aria-hidden=false */
  ariaLabel?: string;
  /** Explicitly set aria-hidden (defaults to true for decorative icons) */
  ariaHidden?: boolean;
}

/**
 * AppIcon renders icons using the configured icon library.
 * This abstraction lets us swap the underlying library without
 * touching every consuming component.
 */
export const AppIcon = forwardRef<SVGSVGElement, AppIconProps>(
  (
    {
      name,
      size = 24,
      color,
      className,
      style,
      ariaLabel,
      ariaHidden,
      ...rest
    },
    ref
  ) => {
    const IconComponent = getIconComponent(name);
    // When ariaLabel is provided the icon is meaningful — default aria-hidden to false.
    // Otherwise default to true (decorative icon).
    const resolvedAriaHidden = ariaHidden ?? (ariaLabel ? false : true);

    return (
      <IconComponent
        ref={ref}
        width={size}
        height={size}
        color={color}
        className={className}
        style={style}
        aria-label={ariaLabel}
        aria-hidden={resolvedAriaHidden}
        {...rest}
      />
    );
  }
);

AppIcon.displayName = "AppIcon";

/**
 * Memoized version for performance in lists and repeated renders
 */
export const MemoAppIcon = React.memo(AppIcon);
