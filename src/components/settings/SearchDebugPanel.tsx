/**
 * Phase 17 — Search debug console surface.
 *
 * A local-only / dev-mode panel that displays the full search
 * observability snapshot. Intended for developer diagnostics and user
 * self-service troubleshooting, NOT for general production UX.
 *
 * PRIVACY: this panel displays aggregate counts and status enums only.
 * It NEVER renders query text, document content, or private metadata.
 */

import { useEffect } from "react";
import { useSearchDiagnostics } from "../../search/observability";
import type { SearchDiagnosticsSnapshot } from "../../search/observability";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-1)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | boolean | undefined | null }) {
  const display = value === undefined || value === null ? "—" : String(value);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", fontSize: "var(--text-footnote)", color: "var(--color-text)" }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontFamily: "monospace", textAlign: "right", wordBreak: "break-all" }}>{display}</span>
    </div>
  );
}

function EngineSection({ snapshot }: { snapshot: SearchDiagnosticsSnapshot }) {
  const { engine } = snapshot;
  return (
    <Section title="Engine">
      <Row label="Provider" value={engine.providerId} />
      <Row label="Dimensions" value={engine.providerDimensions} />
      <Row label="Generation" value={engine.providerGeneration} />
      <Row label="Active provider" value={engine.runtimeStatus.activeEmbeddingProvider} />
      <Row label="Device tier" value={engine.runtimeStatus.deviceTier} />
      <Row label="Last fallback" value={engine.runtimeStatus.lastFallbackReason} />
      <Row label="Last error" value={engine.runtimeStatus.lastError} />
    </Section>
  );
}

function IndexSection({ snapshot }: { snapshot: SearchDiagnosticsSnapshot }) {
  const { index } = snapshot;
  if (!index.health) {
    return (
      <Section title="Index Health">
        <Row label="Status" value={index.healthError ?? "Not available"} />
      </Section>
    );
  }
  const h = index.health;
  return (
    <Section title="Index Health">
      <Row label="Searchable docs" value={h.searchableDocuments} />
      <Row label="Vectors (current)" value={h.vectorsForCurrentProvider} />
      <Row label="Vectors (other)" value={h.vectorsForOtherProviders} />
      <Row label="Missing vectors" value={h.missingVectors} />
      <Row label="Stale vectors" value={h.staleVectors} />
      <Row label="Invalid vectors" value={h.invalidVectors} />
      <Row label="Orphan vectors" value={h.orphanVectors} />
      <Row label="Healthy" value={h.healthy ? "Yes" : "No"} />
      <Row label="Checked at" value={h.checkedAt} />
    </Section>
  );
}

function QueueSection({ snapshot }: { snapshot: SearchDiagnosticsSnapshot }) {
  return (
    <Section title="Write-Through Queue">
      <Row label="Pending" value={snapshot.queue.writeThroughPending} />
      <Row label="Active" value={snapshot.queue.writeThroughActive} />
    </Section>
  );
}

function ModelSection({ snapshot }: { snapshot: SearchDiagnosticsSnapshot }) {
  const { models } = snapshot.model;
  if (models.length === 0) {
    return (
      <Section title="Models">
        <Row label="Status" value="No models tracked" />
      </Section>
    );
  }
  return (
    <Section title="Models">
      {models.map((m) => (
        <Row key={m.id} label={m.id} value={`${m.state}${m.progress > 0 && m.state === "downloading" ? ` (${Math.round(m.progress * 100)}%)` : ""}`} />
      ))}
    </Section>
  );
}

function StorageSection({ snapshot }: { snapshot: SearchDiagnosticsSnapshot }) {
  const s = snapshot.storage.storage;
  const formatBytes = (bytes: number | undefined) =>
    bytes === undefined ? "—" : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return (
    <Section title="Storage">
      <Row label="Usage" value={formatBytes(s.usageBytes)} />
      <Row label="Quota" value={formatBytes(s.quotaBytes)} />
      <Row label="Available" value={formatBytes(s.availableBytes)} />
      <Row label="Persistent" value={s.isPersistent === undefined ? "—" : s.isPersistent ? "Yes" : "No"} />
      <Row label="Probe status" value={s.reason} />
    </Section>
  );
}

export function SearchDebugPanel() {
  const { snapshot, loading, refresh, error } = useSearchDiagnostics();

  // Auto-capture on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-title3)", color: "var(--color-text)" }}>
          Search Diagnostics
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            padding: "4px 10px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-secondary)",
            color: "var(--color-text)",
            cursor: loading ? "progress" : "pointer",
            fontSize: "var(--text-footnote)"
          }}
        >
          {loading ? "Capturing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
          Capture error: {error}
        </div>
      )}

      {snapshot && (
        <div style={{ display: "grid", gap: "var(--space-4)", padding: "var(--space-4)", borderRadius: "var(--radius-lg)", background: "var(--color-bg-secondary)", boxShadow: "var(--shadow-card)" }}>
          <EngineSection snapshot={snapshot} />
          <IndexSection snapshot={snapshot} />
          <QueueSection snapshot={snapshot} />
          <ModelSection snapshot={snapshot} />
          <StorageSection snapshot={snapshot} />
          <div style={{ fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
            Captured at: {snapshot.capturedAt}
          </div>
        </div>
      )}
    </section>
  );
}
