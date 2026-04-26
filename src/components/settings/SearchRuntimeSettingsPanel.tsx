import { useCallback, useState } from 'react';
import { scheduleSearchVectorRebuild } from '../../search/index-lifecycle';
import { applySearchRuntimeSettings } from '../../search/runtime-configure';
import {
  getSearchRuntimeSettings,
  setSearchRuntimeSettings,
  type SearchRuntimeSettings
} from '../../search/runtime-settings';

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

export function SearchRuntimeSettingsPanel() {
  const [settings, setSettingsState] = useState<SearchRuntimeSettings>(() => getSearchRuntimeSettings());

  const update = useCallback((patch: Partial<SearchRuntimeSettings>) => {
    const previous = getSearchRuntimeSettings();
    const next = setSearchRuntimeSettings(patch);
    applySearchRuntimeSettings(next);
    setSettingsState(next);

    if (previous.embeddingRuntime !== next.embeddingRuntime) {
      scheduleSearchVectorRebuild();
    }
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
      </div>
    </section>
  );
}
