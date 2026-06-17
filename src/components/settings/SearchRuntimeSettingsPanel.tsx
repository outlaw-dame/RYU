import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { scheduleSearchVectorRebuild } from '../../search/index-lifecycle';
import { applySearchRuntimeSettings } from '../../search/runtime-configure';
import {
  getSearchRuntimeSettings,
  setSearchRuntimeSettings,
  type SearchRuntimeSettings
} from '../../search/runtime-settings';
import { getSearchUiPreferences, setSearchUiPreferences } from '../../search/ui-preferences';
import {
  clearAllLocalAIArtifacts,
  getAllModelStatuses,
  listEmbeddingArtifactRecords,
  subscribeModelStatus,
  type ClearArtifactsReport,
  type ModelStatus
} from '../../search/model-lifecycle';

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
      <span style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-headline)', color: 'var(--color-text)' }}>
          {label}
        </span>
        <span style={{ fontSize: 'var(--text-footnote)', lineHeight: 1.35, color: 'var(--color-text-secondary)' }}>
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 28, height: 28, flexShrink: 0 }}
      />
    </label>
  );
}

function describeStatus(status: ModelStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Not downloaded';
    case 'downloading':
      return status.progress > 0
        ? `Downloading… ${Math.round(status.progress * 100)}%`
        : 'Downloading…';
    case 'ready':
      return 'Ready on device';
    case 'failed':
      return status.lastError ? `Failed: ${status.lastError}` : 'Failed';
    case 'disabled':
      return 'Disabled';
  }
}

function ModelStatusList() {
  // useSyncExternalStore wired to the existing emit/subscribe surface.
  const statuses = useSyncExternalStore(
    (callback) => subscribeModelStatus(callback),
    () => getAllModelStatuses(),
    // SSR snapshot — model status is a client-only concept; return empty.
    () => [] as readonly ModelStatus[]
  );

  const records = listEmbeddingArtifactRecords();
  if (records.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-text-secondary)' }}>
        On-device models
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-1)' }}>
        {records.map((record) => {
          const status = statuses.find((s) => s.id === record.id);
          const stateLabel = status ? describeStatus(status) : 'Not downloaded';
          return (
            <li
              key={record.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-footnote)',
                color: 'var(--color-text)'
              }}
            >
              <span>{record.displayName}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{stateLabel}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeleteArtifactsControl() {
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ClearArtifactsReport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = useCallback(async () => {
    setPending(true);
    setReport(null);
    try {
      const next = await clearAllLocalAIArtifacts();
      setReport(next);
      setConfirmOpen(false);
      // Re-apply current settings so the runtime returns to a healthy state
      // (deterministic if Enhanced Search was off, otherwise reload the model).
      applySearchRuntimeSettings();
      scheduleSearchVectorRebuild();
    } finally {
      setPending(false);
    }
  }, []);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-text-secondary)' }}>
        Reset local AI &amp; search artifacts
      </div>
      <p style={{ margin: 0, fontSize: 'var(--text-footnote)', color: 'var(--color-text-secondary)', lineHeight: 1.35 }}>
        Removes downloaded models, persisted vectors, and the in-memory search index from this device.
        Lexical search keeps working immediately. Semantic search re-downloads on next use.
      </p>
      {!confirmOpen ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          style={{
            justifySelf: 'start',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text)',
            cursor: pending ? 'progress' : 'pointer',
            fontSize: 'var(--text-footnote)'
          }}
        >
          Delete local AI/search artifacts
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: '#b00020',
              color: '#fff',
              cursor: pending ? 'progress' : 'pointer',
              fontSize: 'var(--text-footnote)'
            }}
            data-testid="confirm-delete-ai-artifacts"
          >
            {pending ? 'Deleting…' : 'Yes, delete now'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={pending}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text)',
              cursor: pending ? 'progress' : 'pointer',
              fontSize: 'var(--text-footnote)'
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {report && report.errors.length === 0 && (
        <div role="status" style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-text-secondary)' }}>
          Cleared. Persisted vectors {report.clearedPersistedVectors ? 'removed' : 'kept'};
          {' '}cached models {report.evictedCacheStorageEntries + report.evictedIndexedDbDatabases.length} entries evicted.
        </div>
      )}
      {report && report.errors.length > 0 && (
        <div role="alert" style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-text-secondary)' }}>
          Reset completed with {report.errors.length} non-blocking issue{report.errors.length === 1 ? '' : 's'}.
        </div>
      )}
    </div>
  );
}

export function SearchRuntimeSettingsPanel() {
  const [settings, setSettingsState] = useState<SearchRuntimeSettings>(() => getSearchRuntimeSettings());
  const [uiPreferences, setUiPreferences] = useState(() => getSearchUiPreferences());

  // Keep local state in sync with persisted runtime settings if another
  // surface (e.g. Phase 17 debug console) mutates them out-of-band.
  useEffect(() => {
    setSettingsState(getSearchRuntimeSettings());
  }, []);

  const update = useCallback((patch: Partial<SearchRuntimeSettings>) => {
    const previous = getSearchRuntimeSettings();
    const next = setSearchRuntimeSettings(patch);
    applySearchRuntimeSettings(next);
    setSettingsState(next);

    if (previous.embeddingRuntime !== next.embeddingRuntime) {
      scheduleSearchVectorRebuild();
    }
  }, []);

  const updateUiPreferences = useCallback((manualFacetControls: boolean) => {
    const next = setSearchUiPreferences({ manualFacetControls });
    setUiPreferences(next);
  }, []);

  return (
    <section style={{ padding: '0 var(--space-4)', display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{
        display: 'grid',
        gap: 'var(--space-5)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-bg-secondary)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-title3)', color: 'var(--color-text)' }}>
            Search
          </h2>
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-footnote)', lineHeight: 1.35 }}>
            Keep search helpful, private, and fast without needing to manage technical details.
          </p>
        </div>

        <ToggleRow
          label="Enhanced Search"
          description="Improves book, author, theme, and ISBN search using private on-device intelligence when available."
          checked={settings.embeddingRuntime !== 'deterministic'}
          onChange={(checked) => update({ embeddingRuntime: checked ? 'auto' : 'deterministic' })}
        />

        <ToggleRow
          label="Advanced Ranking"
          description="Improves ordering for complex searches. May use more battery and memory."
          checked={settings.rerankerRuntime !== 'off'}
          onChange={(checked) => update({ rerankerRuntime: checked ? 'qwen3' : 'off' })}
        />

        <ToggleRow
          label="AI Query Understanding"
          description="Helps interpret longer, more natural searches when local AI is available."
          checked={settings.webLLMIntentRefinement}
          onChange={(checked) => update({ webLLMIntentRefinement: checked })}
        />

        <ToggleRow
          label="Manual Search Facets"
          description="Power-user control: expose Books, Writing, and Fediverse facet chips in Search."
          checked={uiPreferences.manualFacetControls}
          onChange={updateUiPreferences}
        />
      </div>

      <div style={{
        display: 'grid',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-bg-secondary)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <ModelStatusList />
        <DeleteArtifactsControl />
      </div>
    </section>
  );
}
