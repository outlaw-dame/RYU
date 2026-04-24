export function LoadingScreen({ label = "Loading Ryu" }: { label?: string }) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text-secondary)" }}>
      <div style={{ textAlign: "center" }}>
        <div className="skeleton" style={{ width: 72, height: 108, borderRadius: "var(--radius-cover)", margin: "0 auto var(--space-4)" }} />
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{label}</div>
      </div>
    </div>
  );
}
