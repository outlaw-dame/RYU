/**
 * Phase 23 — Home Page component.
 *
 * The Home tab showing the user's library, currently-reading feed,
 * imported books, and BookTok trends.
 *
 * Receives state via props from the parent App shell to avoid
 * duplicating hook/fetch logic during this refactor phase.
 */

import { useTranslation } from "react-i18next";
import { PageShell } from "../../components/layout/PageShell";
import { SectionHeader } from "../../components/common/SectionHeader";
import { CoverGrid } from "../../components/common/CoverGrid";
import { SkeletonCoverGrid } from "../../components/common/Skeleton";
import type { MastodonStatus } from "../../sync/mastodon-client";

export interface HomePageProps {
  /** Whether the user has a connected Mastodon/BookWyrm account */
  connected: boolean;
  /** Now Reading statuses from the live feed */
  nowReadingStatuses: MastodonStatus[];
  nowReadingLoading: boolean;
  nowReadingError: string | null;
  nowReadingLoadedAt: number | null;
  onRefreshNowReading: () => void;
  /** Featured/imported books for the library grid */
  featuredBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string | null }>;
  importedBooksLabel: string;
  /** BookTok trending books */
  bookTokBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string | null }>;
  bookTokLoading: boolean;
  bookTokError: string | null;
  bookTokLoadedAt: number | null;
  onRefreshBookTok: () => void;
  /** Imported books for entity matching */
  importedBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string | null }>;
  /** Callbacks */
  onOpenProfile: (status: MastodonStatus) => void;
  onOpenStatus: (status: MastodonStatus) => void;
  onBookPress: (book: { id: string; title: string; author?: string; coverUrl?: string | null }) => void;
  onSignIn: () => void;
  onSignup: () => void;
  /** NowReading grid renderer (passed to avoid circular deps) */
  renderNowReadingGrid: (props: {
    statuses: MastodonStatus[];
    importedBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string | null }>;
    onOpenProfile: (status: MastodonStatus) => void;
    onOpenStatus: (status: MastodonStatus) => void;
  }) => React.ReactNode;
}

export function HomePage({
  connected,
  nowReadingStatuses,
  nowReadingLoading,
  nowReadingError,
  nowReadingLoadedAt,
  onRefreshNowReading,
  featuredBooks,
  importedBooksLabel,
  bookTokBooks,
  bookTokLoading,
  bookTokError,
  bookTokLoadedAt,
  onRefreshBookTok,
  importedBooks,
  onOpenProfile,
  onOpenStatus,
  onBookPress,
  onSignIn,
  onSignup,
  renderNowReadingGrid
}: HomePageProps) {
  const { t, i18n } = useTranslation();

  return (
    <PageShell
      title={t("screen.library")}
      eyebrow={t("screen.homeEyebrow")}
      id="panel-home"
      role="tabpanel"
      aria-labelledby="tab-home"
    >
      {!connected ? (
        <section style={{ padding: "0 var(--space-4)", marginBottom: "var(--space-6)" }}>
          <article style={{
            borderRadius: "var(--radius-lg)",
            background: "var(--color-bg-secondary)",
            boxShadow: "var(--shadow-card)",
            padding: "var(--space-4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            flexWrap: "wrap"
          }}>
            <div style={{ display: "grid", gap: "var(--space-1)", minWidth: "min(100%, 220px)" }}>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-headline)", color: "var(--color-text)" }}>
                {t("home.memberAccessTitle")}
              </strong>
              <span style={{ fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", color: "var(--color-text-secondary)" }}>
                {t("home.memberAccessDescription")}
              </span>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onSignIn}
                style={{
                  minHeight: "var(--touch-min)",
                  border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                  borderRadius: "var(--radius-md)",
                  background: "transparent",
                  color: "var(--color-text)",
                  fontWeight: 700,
                  fontSize: "var(--text-footnote)",
                  padding: "0 var(--space-4)"
                }}
              >
                {t("home.memberSignIn")}
              </button>
              <button
                type="button"
                onClick={onSignup}
                style={{
                  minHeight: "var(--touch-min)",
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-accent)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "var(--text-footnote)",
                  padding: "0 var(--space-4)"
                }}
              >
                {t("home.becomeMember")}
              </button>
            </div>
          </article>
        </section>
      ) : null}

      <SectionHeader
        title={t("section.currentlyReading")}
        actionLabel={nowReadingLoading ? undefined : t("action.refresh")}
        onAction={nowReadingLoading ? undefined : onRefreshNowReading}
      />
      {nowReadingLoading && nowReadingStatuses.length === 0 ? (
        <SkeletonCoverGrid count={3} />
      ) : nowReadingStatuses.length > 0 ? (
        renderNowReadingGrid({
          statuses: nowReadingStatuses.slice(0, 6),
          importedBooks,
          onOpenProfile,
          onOpenStatus
        })
      ) : (
        <div style={{ padding: "0 var(--space-4)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
            {t("home.noNowReading")}
          </p>
        </div>
      )}
      {nowReadingError ? (
        <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
          {nowReadingError}
        </p>
      ) : nowReadingLoadedAt ? (
        <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {t("home.currentlyReadingUpdatedAt", { date: new Date(nowReadingLoadedAt).toLocaleString(i18n.language) })}
        </p>
      ) : null}

      <div style={{ height: "var(--space-8)" }} />

      <SectionHeader title={importedBooksLabel} />
      <CoverGrid books={featuredBooks.slice(0, 6)} onBookPress={onBookPress} />

      <div style={{ height: "var(--space-8)" }} />

      <SectionHeader
        title={t("section.bookTokTrending")}
        actionLabel={bookTokLoading ? undefined : t("action.refresh")}
        onAction={bookTokLoading ? undefined : onRefreshBookTok}
      />
      {bookTokLoading && bookTokBooks.length === 0 ? (
        <SkeletonCoverGrid count={3} />
      ) : (
        <CoverGrid books={bookTokBooks.slice(0, 9)} onBookPress={onBookPress} />
      )}
      {bookTokError ? (
        <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
          {bookTokError}
        </p>
      ) : bookTokLoadedAt ? (
        <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {t("home.bookTokUpdatedAt", { date: new Date(bookTokLoadedAt).toLocaleString(i18n.language) })}
        </p>
      ) : (
        <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {t("home.bookTokFallback")}
        </p>
      )}
    </PageShell>
  );
}
