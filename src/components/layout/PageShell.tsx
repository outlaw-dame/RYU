/**
 * Phase 23 — Page Shell.
 *
 * The canonical page layout wrapper for all top-level screens.
 * Handles the scrollable container, safe-area insets, and page
 * header (large title) in a consistent way.
 *
 * All tab page components should use PageShell as their root element.
 */

import type { ReactNode } from "react";

export interface PageShellProps {
  /** Large title displayed at the top of the page */
  title: string;
  /** Optional eyebrow/subtitle above the title */
  eyebrow?: string;
  /** Page content */
  children: ReactNode;
  /** ARIA attributes for tab panel semantics */
  id?: string;
  role?: string;
  "aria-labelledby"?: string;
}

export function PageShell({
  title,
  eyebrow,
  children,
  id,
  role,
  "aria-labelledby": ariaLabelledby
}: PageShellProps) {
  return (
    <section
      id={id}
      role={role}
      aria-labelledby={ariaLabelledby}
      className="scroll-container"
      style={{
        height: "100%",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingTop: "var(--safe-top)",
        paddingBottom: "calc(var(--space-8) + var(--safe-bottom))"
      }}
    >
      <header style={{ padding: "0 var(--space-4) var(--space-6)" }}>
        {eyebrow ? (
          <div style={{
            fontSize: "var(--text-subhead)",
            lineHeight: "var(--leading-subhead)",
            letterSpacing: "var(--tracking-subhead)",
            color: "var(--color-text-tertiary)",
            marginBottom: "var(--space-1)"
          }}>
            {eyebrow}
          </div>
        ) : null}
        <h1 style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-large-title)",
          lineHeight: "var(--leading-large-title)",
          letterSpacing: "var(--tracking-large-title)",
          fontWeight: 700,
          color: "var(--color-text)"
        }}>
          {title}
        </h1>
      </header>
      {children}
    </section>
  );
}
