import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchRuntimeSettingsPanel } from './SearchRuntimeSettingsPanel';

type SettingsPage = 'root' | 'intelligence';

function SettingsRow({
  title,
  description,
  onSelect
}: {
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        minHeight: 'var(--touch-min)',
        border: 0,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-text)',
        padding: 'var(--space-4)',
        textAlign: 'left',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-4)',
        boxShadow: 'var(--shadow-card)'
      }}
    >
      <span style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-headline)', fontWeight: 700 }}>
          {title}
        </span>
        <span style={{ fontSize: 'var(--text-footnote)', lineHeight: 1.35, color: 'var(--color-text-secondary)' }}>
          {description}
        </span>
      </span>
      <span aria-hidden="true" style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-title3)' }}>
        ›
      </span>
    </button>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        minHeight: 'var(--touch-min)',
        border: 0,
        background: 'transparent',
        color: 'var(--color-accent)',
        padding: '0 var(--space-4)',
        fontSize: 'var(--text-body)',
        textAlign: 'left'
      }}
    >
      {t('settings.back')}
    </button>
  );
}

export function SettingsScreen({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState<SettingsPage>('root');
  const openIntelligence = useCallback(() => setPage('intelligence'), []);
  const openRoot = useCallback(() => setPage('root'), []);

  if (page === 'intelligence') {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <BackButton onBack={openRoot} />
        <header style={{ padding: '0 var(--space-4)' }}>
          <h2 style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-title1)',
            lineHeight: 'var(--leading-title1)',
            color: 'var(--color-text)'
          }}>
            {t('settings.intelligence.title')}
          </h2>
          <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-footnote)', lineHeight: 1.35 }}>
            {t('settings.intelligence.description')}
          </p>
        </header>
        <SearchRuntimeSettingsPanel />
      </div>
    );
  }

  return (
    <section style={{ padding: '0 var(--space-4)', display: 'grid', gap: 'var(--space-4)' }}>
      <SettingsRow
        title={t('settings.intelligence.title')}
        description={t('settings.rows.intelligence')}
        onSelect={openIntelligence}
      />
      <SettingsRow
        title={t('settings.account.title')}
        description={t('settings.rows.account')}
        onSelect={onOpenAccount ?? (() => {})}
      />
      <SettingsRow
        title={t('settings.privacy.title')}
        description={t('settings.rows.privacy')}
        onSelect={() => {}}
      />
    </section>
  );
}
