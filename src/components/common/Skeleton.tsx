export function Skeleton({ style }: { style?: React.CSSProperties }) {
  return <div className="skeleton" aria-hidden="true" style={{ borderRadius: "var(--radius-md)", ...style }} />;
}

export function SkeletonCover() {
  return <Skeleton style={{ width: "100%", aspectRatio: "2 / 3", borderRadius: "var(--radius-cover)" }} />;
}

export function SkeletonCoverGrid({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 128px))", justifyContent: "start", alignItems: "start", gap: "var(--space-4) var(--space-3)", padding: "0 var(--space-4)" }}>
      {Array.from({ length: count }, (_, index) => <SkeletonCover key={index} />)}
    </div>
  );
}
