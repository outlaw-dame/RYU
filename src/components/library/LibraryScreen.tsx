/**
 * Phase 28 - Library Screen.
 *
 * Main library view showing the user's books organized by reading status
 * with search-within-library powered by the existing search infrastructure.
 */

import { useTranslation } from "react-i18next";
import { PageShell } from "../layout/PageShell";
import { CoverGrid } from "../common/CoverGrid";
import { EmptyState } from "../common/EmptyState";
import { SectionHeader } from "../common/SectionHeader";
import { SkeletonCoverGrid } from "../common/Skeleton";
import { useLibrary, type ReadingStatus } from "../../hooks/useLibrary";

export interface LibraryScreenProps {
  onBookPress?: (book: { id: string; title: string; author?: string; coverUrl?: string | null }) => void;
}

type FilterTab = "all" | ReadingStatus;

const filterTabs: FilterTab[] = ["all", "want-to-read", "reading", "read", "did-not-finish"];

function filterLabel(tab: FilterTab, t: (key: string) => string): string {
  switch (tab) {
    case "all": return t("library.allBooks");
    case "want-to-read": return t("library.wantToRead");
    case "reading": return t("library.reading");
    case "read": return t("library.read");
    case "did-not-finish": return t("library.didNotFinish");
  }
}

export function LibraryScreen({ onBookPress }: LibraryScreenProps) {
  const { t } = useTranslation();
  const {
    filteredBooks,
    loading,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    library
  } = useLibrary();

  const bookCount = filteredBooks.length;

  return (
    <PageShell title={t("library.title")}>
      {/* Search bar */}
      <div style={{ padding: "0 var(--space-4)", marginBottom: "var(--space-4)" }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("library.searchPlaceholder")}
          aria-label={t("library.searchAriaLabel")}
          style={{
            width: "100%",
            minHeight: "var(--touch-min)",
            padding: "0 var(--space-4)",
            border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-bg-secondary)",
            color: "var(--color-text)",
            fontSize: "var(--text-body)",
            outline: "none"
          }}
        />
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label={t("readingStatus.label")}
        style={{
          display: "flex",
          gap: "var(--space-2)",
          padding: "0 var(--space-4)",
          marginBottom: "var(--space-4)",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none"
        }}
      >
        {filterTabs.map((tab) => {
          const isActive = filter === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(tab)}
              style={{
                flexShrink: 0,
                minHeight: 32,
                padding: "0 var(--space-3)",
                border: isActive
                  ? "1.5px solid var(--color-accent)"
                  : "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                borderRadius: "var(--radius-sm)",
                background: isActive
                  ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-bg))"
                  : "transparent",
                color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "var(--text-caption1)",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              {filterLabel(tab, t)}
            </button>
          );
        })}
      </div>

      {/* Book count */}
      {!loading && library.all.length > 0 ? (
        <SectionHeader title={t("library.bookCount", { count: bookCount })} />
      ) : null}

      {/* Content */}
      {loading ? (
        <SkeletonCoverGrid count={6} />
      ) : filteredBooks.length === 0 ? (
        library.all.length === 0 ? (
          <EmptyState
            title={t("library.emptyTitle")}
            description={t("library.emptyDescription")}
          />
        ) : (
          <EmptyState
            title={t("library.emptyFilterTitle")}
            description={t("library.emptyFilterDescription")}
          />
        )
      ) : (
        <CoverGrid books={filteredBooks} onBookPress={onBookPress} />
      )}
    </PageShell>
  );
}
