/**
 * Phase 23 — Shelves Page component.
 *
 * The Shelves tab displaying bookmarks, favourites, and lists
 * from the user's connected Mastodon/BookWyrm account.
 */

import { useTranslation } from "react-i18next";
import { PageShell } from "../../components/layout/PageShell";
import { SectionHeader } from "../../components/common/SectionHeader";
import { EmptyState } from "../../components/common/EmptyState";
import { Skeleton } from "../../components/common/Skeleton";
import type { MastodonStatus, MastodonList } from "../../sync/mastodon-client";


export interface ShelvesPageProps {
  connected: boolean;
  bookmarks: MastodonStatus[];
  favourites: MastodonStatus[];
  lists: MastodonList[];
  loading: boolean;
  error: "unauthenticated" | "network" | null;
  onReload: () => void;
  onRemoveBookmark: (statusId: string) => Promise<void>;
  onRemoveFavourite: (statusId: string) => Promise<void>;
  importedBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string }>;
  renderStatusRow: (props: {
    status: MastodonStatus;
    importedBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string }>;
    actions: Array<{ label: string; pendingLabel: string; handler: () => Promise<void> }>;
  }) => React.ReactNode;
}


export function ShelvesPage({
  connected,
  bookmarks,
  favourites,
  lists,
  loading,
  error,
  onReload,
  onRemoveBookmark,
  onRemoveFavourite,
  importedBooks,
  renderStatusRow
}: ShelvesPageProps) {
  const { t } = useTranslation();

  return (
    <PageShell
      title={t("screen.shelves")}
      id="panel-shelves"
      role="tabpanel"
      aria-labelledby="tab-shelves"
    >
      {!connected ? (
        <EmptyState title={t("shelves.signInTitle")} description={t("shelves.signInDescription")} />
      ) : (
        <div style={{ display: "grid", gap: "var(--space-6)" }}>
          <section style={{ display: "grid", gap: "var(--space-3)" }}>
            <SectionHeader
              title={t("shelves.bookmarks")}
              actionLabel={loading ? undefined : t("action.refresh")}
              onAction={loading ? undefined : onReload}
            />
            <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
              {loading && bookmarks.length === 0 ? (
                <>
                  <Skeleton style={{ height: 92 }} />
                  <Skeleton style={{ height: 92 }} />
                </>
              ) : bookmarks.length > 0 ? (
                bookmarks.map((status) =>
                  renderStatusRow({
                    status,
                    importedBooks,
                    actions: [{
                      label: t("shelves.removeBookmark"),
                      pendingLabel: t("shared.removing"),
                      handler: () => onRemoveBookmark(status.id)
                    }]
                  })
                )
              ) : (
                <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                  {t("shelves.noBookmarks")}
                </p>
              )}
            </div>
          </section>


          <section style={{ display: "grid", gap: "var(--space-3)" }}>
            <SectionHeader title={t("shelves.favourites")} />
            <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
              {loading && favourites.length === 0 ? (
                <>
                  <Skeleton style={{ height: 92 }} />
                  <Skeleton style={{ height: 92 }} />
                </>
              ) : favourites.length > 0 ? (
                favourites.map((status) =>
                  renderStatusRow({
                    status,
                    importedBooks,
                    actions: [{
                      label: t("shelves.unfavourite"),
                      pendingLabel: t("shared.removing"),
                      handler: () => onRemoveFavourite(status.id)
                    }]
                  })
                )
              ) : (
                <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                  {t("shelves.noFavourites")}
                </p>
              )}
            </div>
          </section>

          {lists.length > 0 ? (
            <section style={{ display: "grid", gap: "var(--space-3)" }}>
              <SectionHeader title={t("shelves.lists")} />
              <div style={{ display: "grid", gap: "var(--space-2)", padding: "0 var(--space-4)" }}>
                {lists.map((list) => (
                  <div
                    key={list.id}
                    style={{
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text)",
                      padding: "var(--space-3) var(--space-4)",
                      fontWeight: 600,
                      fontSize: "var(--text-subhead)",
                      boxShadow: "var(--shadow-card)"
                    }}
                  >
                    {list.title}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {error === "unauthenticated" ? (
            <p style={{ margin: "0 var(--space-4)", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
              {t("shelves.errorUnauthenticated")}
            </p>
          ) : error === "network" ? (
            <p style={{ margin: "0 var(--space-4)", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
              {t("shelves.errorNetwork")}
            </p>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
