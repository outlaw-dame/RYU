/**
 * Phase 23 — Adaptive Toolbar (Tab Bar) wrapper.
 *
 * Wraps Framework7 Toolbar with consistent safe-area handling and
 * translucent glass styling. Used specifically as the bottom tab bar
 * for the main app navigation.
 *
 * Features:
 * - Bottom position with safe-area padding
 * - Translucent glass background (blur + saturate)
 * - Consistent border styling
 * - Labels-visible mode for icon+text tabs
 */

import React from "react";
import type { ReactNode } from "react";
import { Toolbar } from "framework7-react";

export interface AdaptiveToolbarProps {
  /** Toolbar position (default: bottom) */
  position?: "top" | "bottom";
  /** Whether this is a tabbar */
  tabbar?: boolean;
  /** Whether icons mode is active (larger icon-friendly spacing) */
  icons?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Toolbar children (Link components for tabs) */
  children: ReactNode;
}

export function AdaptiveToolbar({
  position = "bottom",
  tabbar = true,
  icons = true,
  className,
  style,
  children
}: AdaptiveToolbarProps) {
  return (
    <Toolbar
      position={position}
      tabbar={tabbar}
      icons={icons}
      className={className}
      style={{
        "--f7-toolbar-bg-color": "var(--color-bg-glass)",
        "--f7-toolbar-border-color": "var(--color-separator)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        ...style
      } as React.CSSProperties}
    >
      {children}
    </Toolbar>
  );
}
