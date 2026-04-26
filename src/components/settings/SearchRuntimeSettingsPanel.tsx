import { useCallback, useState } from 'react';
import { applySearchRuntimeSettings } from '../../search/runtime-configure';
import {
  getSearchRuntimeSettings,
  setSearchRuntimeSettings,
  type EmbeddingRuntime,
  type RerankerRuntime,
  type SearchRuntimeSettings
} from '../../search/runtime-settings';

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-headline)', color: 'var(--color-text)' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-footnote)', lineHeight: 1.35, color: 'var(--color-text-secondary)' }}>
        {description}
      </span>
      {children}
    </label>
  );
}

const controlStyle = {
  width: '100%',
  minHeight: 'var(--touch-min)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid color-mix(in srgb, var(--color-text) 12%, transparent)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  padding: '0 var(--space-3)',
  fontSize: 'var(--text-body)'
} as const;

export function SearchRuntimeSettingsPanel() {
  const [settings, setSettingsState] = useState<SearchRuntimeSettings>(() => getSearchRuntimeSettings());

  const update = useCallback((patch: Partial<SearchRuntimeSettings>) => {
    const next = setSearchRuntimeSettings(patch);
    applySearchRuntimeSettings(next);
    setSettingsState(next);
  }, []);

  return (
    <section style={{ padding: '0 var(--space-4)', display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{
        display: 'grid',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-bg-secondary)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-title3)', color: 'var(--color-text)' }}>
            Search quality
          </h2>
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-footnote)', lineHeight: 1.35 }}>
            Auto uses the best local semantic model this device can handle, then falls back safely.
          </p>
        </div>

        <Field
          label="Semantic search"
          description="Auto is recommended. It tries EmbeddingGemma on capable devices, then MiniLM, then deterministic fallback."
        >
          <select
            value={settings.embeddingRuntime}
            onChange={(event) => update({ embeddingRuntime: event.target.value as EmbeddingRuntime })}
            style={controlStyle}
          >
            <option value="auto">Auto enhanced search</option>
            <option value="embeddinggemma">EmbeddingGemma when available</option>
            <option value="minilm">MiniLM when available</option>
            <option value="deterministic">Basic deterministic search</option>
          </select>
        </Field>

        <Field
          label="Advanced ranking"
          description="Off is recommended by default. Rerankers can improve ordering but cost more memory and latency."
        >
          <select
            value={settings.rerankerRuntime}
            onChange={(event) => update({ rerankerRuntime: event.target.value as RerankerRuntime })}
            style={controlStyle}
          >
            <option value="off">Off</option>
            <option value="qwen3">Qwen3 local reranker</option>
            <option value="jina">Jina reranker proxy</option>
          </select>
        </Field>

        {settings.rerankerRuntime === 'jina' ? (
          <Field
            label="Jina proxy URL"
            description="Use your own server-side proxy. Do not put provider API keys in the browser."
          >
            <input
              type="url"
              value={settings.jinaRerankerUrl ?? ''}
              onChange={(event) => update({ jinaRerankerUrl: event.target.value })}
              placeholder="/api/rerank"
              style={controlStyle}
            />
          </Field>
        ) : null}

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <span style={{ display: 'grid', gap: 'var(--space-1)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-headline)', color: 'var(--color-text)' }}>
              AI query understanding
            </span>
            <span style={{ fontSize: 'var(--text-footnote)', lineHeight: 1.35, color: 'var(--color-text-secondary)' }}>
              Uses WebLLM only when already initialized. Deterministic intent remains the fallback.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.webLLMIntentRefinement}
            onChange={(event) => update({ webLLMIntentRefinement: event.target.checked })}
            style={{ width: 28, height: 28 }}
          />
        </label>
      </div>
    </section>
  );
}
