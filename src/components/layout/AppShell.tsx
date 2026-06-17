/**
 * Phase 23 — App Shell.
 *
 * The root layout component that provides the full-height container,
 * handles the offline indicator, and hosts the main content area
 * and tab bar. All route-level content is rendered inside this shell.
 *
 * Responsibilities:
 * - Full-viewport flexbox layout (dvh)
 * - Offline indicator
 * - Main content area (flex: 1, overflow hidden)
 * - Tab bar positioned at the bottom
 *
 * Does NOT own individual page state or navigation logic — those are
 * handled by the tab router or parent App component.
 */

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { OfflineIndicator } from "../common/OfflineIndicator";
import { AppTabBar, type TabId } from "./AppTabBar";

export interface AppShellProps {
  /** Currently active tab */
  activeTab: TabId;
  /** Tab change handler */
  onTabChange: (tab: TabId) => void;
  /** The main content (tab panels) */
  children: ReactNode;
}

export function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <div style={{
          width: "100%",
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          overflow: "hidden"
        }}>
          <OfflineIndicator />
          <main style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
            {children}
          </main>
          <AppTabBar activeTab={activeTab} onChange={onTabChange} />
        </div>
      </ErrorBoundary>
    </MotionConfig>
  );
}
