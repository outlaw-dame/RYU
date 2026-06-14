import React from "react";
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
  /** Whether to allow closing by clicking the backdrop (default true) */
  closeByBackdropClick?: boolean;
  /** Whether to allow closing by pressing the Escape key (default true) */
  closeOnEscape?: boolean;
  /** Show backdrop overlay (default true) */
  backdrop?: boolean;
  /** Additional CSS class on sheet element */
  className?: string;
  /** Additional inline styles on sheet element */
  style?: React.CSSProperties;
}

export function AdaptiveSheet({
  opened,
  onClose,
  onClosed,
  children,
  ariaLabel = "Sheet",
  swipeToClose = true,
  closeByBackdropClick = true,
  closeOnEscape = true,
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
      closeByBackdropClick={closeByBackdropClick}
      closeOnEscape={closeOnEscape}
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
