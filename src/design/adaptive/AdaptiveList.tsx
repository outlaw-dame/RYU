/**
 * Phase 23 — Adaptive List wrapper.
 *
 * Wraps Framework7 List/ListItem with consistent styling for grouped
 * and inset lists. Provides the standard iOS/Material list styling
 * that adapts to the platform theme.
 *
 * Features:
 * - Inset mode for rounded card-style lists
 * - Divider lines between items
 * - Consistent spacing from design tokens
 * - Accessible list semantics
 */

import React from "react";
import type { ReactNode } from "react";
import { List, ListItem } from "framework7-react";

export interface AdaptiveListProps {
  /** Whether to use inset (rounded card) styling */
  inset?: boolean;
  /** Whether to show dividers between items */
  dividers?: boolean;
  /** Whether this is a media list (with thumbnails) */
  mediaList?: boolean;
  /** Whether items have chevron disclosure indicators */
  chevronCenter?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** List children (typically AdaptiveListItem or ListItem) */
  children: ReactNode;
}

export function AdaptiveList({
  inset = true,
  dividers = true,
  mediaList,
  chevronCenter,
  className,
  style,
  children
}: AdaptiveListProps) {
  return (
    <List
      inset={inset}
      dividersIos={dividers}
      dividersMd={dividers}
      mediaList={mediaList}
      chevronCenter={chevronCenter}
      className={className}
      style={{
        "--f7-list-bg-color": "var(--color-bg-secondary)",
        "--f7-list-item-title-font-size": "var(--text-body)",
        "--f7-list-item-after-font-size": "var(--text-footnote)",
        ...style
      } as React.CSSProperties}
    >
      {children}
    </List>
  );
}

export interface AdaptiveListItemProps {
  /** Primary text */
  title?: string;
  /** Secondary text below title */
  subtitle?: string;
  /** Text after (right-aligned) */
  after?: string;
  /** Header text above title */
  header?: string;
  /** Footer text below subtitle */
  footer?: string;
  /** Whether to show a link chevron */
  link?: boolean | string;
  /** Click handler */
  onClick?: () => void;
  /** Whether the item is a toggle/switch */
  toggle?: boolean;
  /** Toggle checked state */
  checked?: boolean;
  /** Toggle change handler */
  onToggleChange?: (checked: boolean) => void;
  /** Custom content slot */
  children?: ReactNode;
}

export function AdaptiveListItem({
  title,
  subtitle,
  after,
  header,
  footer,
  link,
  onClick,
  toggle,
  checked,
  onToggleChange,
  children
}: AdaptiveListItemProps) {
  return (
    <ListItem
      title={title}
      subtitle={subtitle}
      after={after}
      header={header}
      footer={footer}
      link={link === true ? "#" : link || undefined}
      onClick={onClick}
      checkbox={toggle}
      checked={checked}
      onChange={onToggleChange ? (event: any) => onToggleChange(event.target.checked) : undefined}
    >
      {children}
    </ListItem>
  );
}
