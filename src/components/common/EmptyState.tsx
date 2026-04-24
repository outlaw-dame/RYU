export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ padding: "var(--space-12) var(--space-6)", textAlign: "center" }}>
      <h2 style={{
        margin: "0 0 var(--space-2)",
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-title3)",
        lineHeight: "var(--leading-title3)",
        letterSpacing: "var(--tracking-title3)",
        color: "var(--color-text)"
      }}>{title}</h2>
      {description ? <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-subhead)", lineHeight: "var(--leading-subhead)" }}>{description}</p> : null}
    </div>
  );
}
