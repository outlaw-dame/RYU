/**
 * Phase 23 — Adaptive Page wrapper.
 *
 * Wraps Framework7 Page component with consistent safe-area handling,
 * scrollable page content, and standardized padding. All major screens
 * should use this instead of custom div-based shells.
 *
 * Features:
 * - env(safe-area-inset-*) integration
 * - Scrollable page content area
 * - Consistent background/color from design tokens
 * - Optional pull-to-refresh support (F7 native)
 */

import React from "react";
import type { ReactNode } from "react";
import { Page, PageContent } from "framework7-react";

export interface AdaptivePageProps {
  /** Unique page name for Framework7 routing */
  name?: string;
  /** Whether to show a back link in the navbar (when using F7 navigation) */
  noNavbar?: boolean;
  /** Whether to hide the toolbar on this page */
  noToolbar?: boolean;
  /** Additional CSS class on the page element */
  className?: string;
  /** Additional inline styles on the page element */
  style?: React.CSSProperties;
  /** Page contents */
  children: ReactNode;
  /** Tab page - if true, treated as tab container page */
  tabs?: boolean;
  /** Unique tab identifier */
  id?: string;
  /** ARIA role override */
  role?: string;
  /** ARIA labelledby */
  "aria-labelledby"?: string;
}

export function AdaptivePage({
  name,
  noNavbar,
  noToolbar,
  className,
  style,
  children,
  tabs,
  id,
  role,
  "aria-labelledby": ariaLabelledby
}: AdaptivePageProps) {
  return (
    <Page
      name={name}
      noNavbar={noNavbar}
      noToolbar={noToolbar}
      tabs={tabs}
      id={id}
      className={className}
      pageContent={false}
      style={{
        "--f7-page-bg-color": "var(--color-bg)",
        color: "var(--color-text)",
        ...style
      } as React.CSSProperties}
    >
      <PageContent
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "calc(var(--space-8) + env(safe-area-inset-bottom, 0px))"
        }}
      >
        {children}
      </PageContent>
    </Page>
  );
}
