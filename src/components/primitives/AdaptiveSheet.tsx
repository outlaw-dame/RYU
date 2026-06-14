/**
 * AdaptiveSheet — reusable bottom-sheet primitive backed by Framework7 Sheet.
 *
 * This wraps Framework7's Sheet component and integrates with our platform
 * detection layer. On iOS it shows the translucent pull-to-dismiss style,
 * on Android/desktop it uses a more neutral Material sheet.
 *
 * Features:
 * - Swipe-to-close support
 * - Backdrop click to dismiss
 * - Escape key to dismiss
 * - Safe-area-aware padding
 * - Controlled open/close via `opened` prop
 */

import type { ReactNode } from "react";
import { Sheet, PageContent } from "framework7-react";
import type { Sheet as SheetInstance } from "framework7/types";

export interface AdaptiveSheetProps {
  /** Whether the sheet is currently open */
  opened: boolean;
  /** Called when the sheet requests to be closed (backdrop tap, swipe, escape) */
  onClose: () => void;
  /** Called after the closing animation finishes — use for cleanup */
  onClosed?: () => void;
  /** Sheet contents */
  children: ReactNode;
  /** Accessibility label for the sheet surface */
  ariaLabel?: string;
  /** Whether to allow swipe-to-close (default true) */
  swipeToClose?: boolean;
  /** Show backdrop overlay (default true) */
  backdrop?: boolean;
  /** Additional CSS class on sheet element */
  className?: string;
  /** Additional inline styles on sheet element */
  style?: React.CSSProperties;
}

/**
 * Adaptive sheet primitive. Uses Framework7 Sheet under the hood with
 * sensible defaults for a reading/social app context:
 * - swipe to close
 * - backdrop click to close
 * - escape key to close
 * - safe area inset padding at the bottom
 */
export function AdaptiveSheet({
  opened,
  onClose,
  onClosed,
  children,
  ariaLabel = "Sheet",
  swipeToClose = true,
  backdrop = true,
  className,
  style
}: AdaptiveSheetProps) {
  const handleSheetClose = (_instance?: SheetInstance.Sheet) => {
    onClose();
  };

  const handleSheetClosed = (_instance?: SheetInstance.Sheet) => {
    onClosed?.();
  };

  return (
    <Sheet
      opened={opened}
      backdrop={backdrop}
      closeByBackdropClick
      closeOnEscape
      swipeToClose={swipeToClose}
      onSheetClose={handleSheetClose}
      onSheetClosed={handleSheetClosed}
      className={className}
      style={{
        "--f7-sheet-border-color": "transparent",
        borderRadius: "var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0",
        overflow: "hidden",
        maxHeight: "88dvh",
        ...style
      } as React.CSSProperties}
    >
      <PageContent
        style={{
          paddingBottom: "calc(var(--space-6, 24px) + env(safe-area-inset-bottom, 0px))"
        }}
      >
        <div role="dialog" aria-modal="true" aria-label={ariaLabel}>
          {children}
        </div>
      </PageContent>
    </Sheet>
  );
}
