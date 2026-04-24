import { memo, useCallback, useRef } from "react";
import { Bell, Home, LayoutGrid, Search, User } from "lucide-react";

export type TabId = "home" | "search" | "shelves" | "activity" | "profile";

type TabDefinition = {
  id: TabId;
  label: string;
  Icon: typeof Home;
};

const tabs: TabDefinition[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "search", label: "Search", Icon: Search },
  { id: "shelves", label: "Shelves", Icon: LayoutGrid },
  { id: "activity", label: "Activity", Icon: Bell },
  { id: "profile", label: "Profile", Icon: User }
];

export const AppTabBar = memo(function AppTabBar({ activeTab, onChange }: { activeTab: TabId; onChange: (tab: TabId) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else return;
    event.preventDefault();
    const next = tabs[nextIndex];
    onChange(next.id);
    refs.current[nextIndex]?.focus();
  }, [onChange]);

  return (
    <nav role="tablist" aria-label="Main navigation" style={{
      display: "flex",
      alignItems: "stretch",
      height: "calc(var(--tab-bar-height) + var(--safe-bottom))",
      paddingBottom: "var(--safe-bottom)",
      paddingLeft: "var(--safe-left)",
      paddingRight: "var(--safe-right)",
      borderTop: "0.5px solid var(--color-separator)",
      background: "var(--color-bg-glass)",
      backdropFilter: "saturate(180%) blur(20px)",
      WebkitBackdropFilter: "saturate(180%) blur(20px)",
      flexShrink: 0
    }}>
      {tabs.map(({ id, label, Icon }, index) => {
        const active = id === activeTab;
        return (
          <button
            key={id}
            id={`tab-${id}`}
            ref={(node) => { refs.current[index] = node; }}
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
            <Icon size={25} strokeWidth={1.6} fill="currentColor" aria-hidden="true" />
            <span style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-tab)",
              lineHeight: 1,
              letterSpacing: "var(--tracking-caption2)",
              fontWeight: active ? 600 : 500,
              marginTop: 1
            }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
});
