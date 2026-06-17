/**
 * Phase 23 — App Tab Bar.
 *
 * A Framework7 Toolbar-backed tab bar with full ARIA tablist semantics.
 * Provides keyboard navigation (ArrowLeft/Right), roving tabindex,
 * and consistent safe-area handling via F7's bottom toolbar positioning.
 *
 * Uses AppIcon for all icon rendering (no direct Phosphor imports).
 */

import { memo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Toolbar } from "framework7-react";
import { AppIcon } from "../../design/icons/AppIcon";
import type { AppIconName } from "../../design/icons/iconMap";

export type TabId = "home" | "search" | "shelves" | "activity" | "profile";

type TabDefinition = {
  id: TabId;
  labelKey: string;
  icon: AppIconName;
};

const tabs: TabDefinition[] = [
  { id: "home", labelKey: "tabs.home", icon: "home" },
  { id: "search", labelKey: "tabs.search", icon: "search" },
  { id: "shelves", labelKey: "tabs.shelves", icon: "grid" },
  { id: "activity", labelKey: "tabs.activity", icon: "notification" },
  { id: "profile", labelKey: "tabs.account", icon: "user" }
];

export const AppTabBar = memo(function AppTabBar({
  activeTab,
  onChange
}: {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}) {
  const { t } = useTranslation();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else return;
      event.preventDefault();
      const next = tabs[nextIndex];
      onChange(next.id);
      refs.current[nextIndex]?.focus();
    },
    [onChange]
  );

  return (
    <Toolbar
      position="bottom"
      tabbar
      icons
      style={{
        "--f7-toolbar-bg-color": "var(--color-bg-glass)",
        "--f7-toolbar-border-color": "var(--color-separator)",
        "--f7-toolbar-height": "var(--tab-bar-height)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)"
      } as React.CSSProperties}
    >
      <nav
        role="tablist"
        aria-label={t("nav.main")}
        style={{
          display: "flex",
          alignItems: "stretch",
          width: "100%",
          height: "100%",
          paddingLeft: "var(--safe-left)",
          paddingRight: "var(--safe-right)"
        }}
      >
        {tabs.map(({ id, labelKey, icon }, index) => {
          const active = id === activeTab;
          const label = t(labelKey);
          return (
            <button
              key={id}
              id={`tab-${id}`}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              style={{
                flex: 1,
                minWidth: "var(--touch-min)",
                minHeight: "var(--touch-min)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                padding: 0,
                border: 0,
                background: "transparent",
                color: active ? "var(--color-accent)" : "#8e8e93",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent"
              }}
            >
              <AppIcon name={icon} size={25} color="currentColor" />
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-tab)",
                  lineHeight: 1,
                  letterSpacing: "var(--tracking-caption2)",
                  fontWeight: active ? 600 : 500,
                  marginTop: 1
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </Toolbar>
  );
});
