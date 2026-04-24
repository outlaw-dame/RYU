export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--space-4)", marginBottom: "var(--space-3)" }}>
      <h2 style={{
        margin: 0,
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-caption2)",
        lineHeight: "var(--leading-caption2)",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--color-text-tertiary)",
        fontWeight: 700
      }}>{title}</h2>
      {actionLabel ? (
        <button type="button" onClick={onAction} style={{
          minHeight: "var(--touch-min)",
          border: 0,
          background: "transparent",
          color: "var(--color-accent)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-subhead)",
          fontWeight: 600,
          padding: "0 0 0 var(--space-2)"
        }}>{actionLabel}</button>
      ) : null}
    </div>
  );
}
