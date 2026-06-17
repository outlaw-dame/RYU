/**
 * Phase 23 — Adaptive Navbar wrapper.
 *
 * Wraps Framework7 Navbar with consistent styling, safe-area handling,
 * and translucency. Provides the standard app navigation bar with
 * optional large-title iOS behavior.
 *
 * Features:
 * - Translucent blur on iOS (iosTranslucentBars)
 * - Large title support for scrollable pages
 * - Consistent font and spacing from design tokens
 * - Optional subtitle (eyebrow text)
 */

import React from "react";
import type { ReactNode } from "react";
import { Navbar, NavLeft, NavTitle, NavRight } from "framework7-react";

export interface AdaptiveNavbarProps {
  /** Primary title */
  title: string;
  /** Optional subtitle/eyebrow */
  subtitle?: string;
  /** Whether to use large title style (iOS-native feel) */
  large?: boolean;
  /** Whether to show the back button */
  backLink?: boolean | string;
  /** Content for the left slot (overrides backLink) */
  left?: ReactNode;
  /** Content for the right slot */
  right?: ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Whether the navbar is transparent (no border/background until scroll) */
  transparent?: boolean;
}

export function AdaptiveNavbar({
  title,
  subtitle,
  large = false,
  backLink,
  left,
  right,
  className,
  transparent
}: AdaptiveNavbarProps) {
  return (
    <Navbar
      title={title}
      subtitle={subtitle}
      large={large}
      backLink={backLink === true ? "Back" : backLink || undefined}
      transparent={transparent}
      className={className}
      style={{
        "--f7-navbar-font-size": "var(--text-headline)",
        "--f7-navbar-title-font-weight": "700",
        "--f7-navbar-title-font-size": "var(--text-headline)",
        "--f7-navbar-large-title-font-size": "var(--text-large-title)",
        "--f7-navbar-large-title-font-weight": "700"
      } as React.CSSProperties}
    >
      {left ? <NavLeft>{left}</NavLeft> : null}
      {subtitle && !large ? (
        <NavTitle>
          <div style={{ display: "grid", gap: 1, textAlign: "center" }}>
            {subtitle ? (
              <span style={{
                fontSize: "var(--text-caption1)",
                color: "var(--color-text-tertiary)",
                fontWeight: 500
              }}>
                {subtitle}
              </span>
            ) : null}
            <span>{title}</span>
          </div>
        </NavTitle>
      ) : null}
      {right ? <NavRight>{right}</NavRight> : null}
    </Navbar>
  );
}
