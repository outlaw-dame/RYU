/**
 * Phase 23 — Search Page component.
 *
 * The Search tab with local hybrid search, federated discovery,
 * import controls, and autocomplete. Receives state via props.
 */

import { useTranslation } from "react-i18next";
import { PageShell } from "../../components/layout/PageShell";
import { AdaptiveSearchField } from "../../design/adaptive";
import { SectionHeader } from "../../components/common/SectionHeader";
import { CoverGrid } from "../../components/common/CoverGrid";
import { EmptyState } from "../../components/common/EmptyState";
import { SkeletonCoverGrid } from "../../components/common/Skeleton";
import type { MastodonStatus } from "../../sync/mastodon-client";
import type { RankedSearchResult } from "../../search/types";
import type { SearchExplanation } from "../../search/explain";
import type { GroupedSearchResults } from "../../search/group";

type ExplainedSearchResult = RankedSearchResult & { explanation?: SearchExplanation };
type ExplainedGroupedResults = GroupedSearchResults<ExplainedSearchResult>;
type SearchFacet = "books" | "writing" | "fediverse";

export interface SearchPageProps {
  // Search state
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchResults: ExplainedGroupedResults | null;
  searchError: string | null;
  isSearching: boolean;
  // Facets
  showFacetControls: boolean;
  searchFacet: SearchFacet;
  onSearchFacetChange: (facet: SearchFacet) => void;
  showLocalSearchResults: boolean;
  showFederatedDiscoveryResults: boolean;
  // Autocomplete
  autocompleteResults: Array<{ id: string; title: string }>;
  activeAutocompleteIndex: number;
  onAutocompleteIndexChange: (index: number) => void;
  onApplySuggestion: (title: string) => void;
  // Import
  importUrl: string;
  onImportUrlChange: (value: string) => void;
  onImport: () => void;
  isImporting: boolean;
  importError: string | null;
  importUrlHints: string[];
  dbReady: boolean;
  // Federated discovery
  discoveryStatuses: MastodonStatus[];
  discoveryLoading: boolean;
  discoveryError: string | null;
  relayResults: Array<{ id: string }>;
  relayLoading: boolean;
  relayError: string | null;
  // Library content
  importedBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string | null }>;
  // Callbacks
  onSearchResultSelect: (result: ExplainedSearchResult) => void;
  onBookPress: (book: { id: string; title: string; author?: string; coverUrl?: string | null }) => void;
  // Render delegates (to avoid inlining complex components)
  renderSearchResults: (props: {
    results: ExplainedGroupedResults;
    query: string;
    onSelect: (result: ExplainedSearchResult) => void;
  }) => React.ReactNode;
  renderDiscoveryResults: (props: {
    statuses: MastodonStatus[];
    relayResults: Array<{ id: string }>;
  }) => React.ReactNode;
}

const SEARCH_AUTOCOMPLETE_LIST_ID = "search-autocomplete-list";
const IMPORT_URL_DATALIST_ID = "import-url-suggestion-list";

export function SearchPage({
  searchQuery,
  onSearchQueryChange,
  searchResults,
  searchError,
  isSearching,
  showFacetControls,
  searchFacet,
  onSearchFacetChange,
  showLocalSearchResults,
  showFederatedDiscoveryResults,
  autocompleteResults,
  activeAutocompleteIndex,
  onAutocompleteIndexChange,
  onApplySuggestion,
  importUrl,
  onImportUrlChange,
  onImport,
  isImporting,
  importError,
  importUrlHints,
  dbReady,
  discoveryStatuses,
  discoveryLoading,
  discoveryError,
  relayResults,
  relayLoading,
  relayError,
  importedBooks,
  onSearchResultSelect,
  onBookPress,
  renderSearchResults,
  renderDiscoveryResults
}: SearchPageProps) {
  const { t } = useTranslation();
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return (
    <PageShell
      title={t("screen.search")}
      id="panel-search"
      role="tabpanel"
      aria-labelledby="tab-search"
    >
      <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
        <AdaptiveSearchField
          value={searchQuery}
          onChange={(event) => {
            onSearchQueryChange(event.target.value);
            onAutocompleteIndexChange(-1);
          }}
          onKeyDown={(event) => {
            if (!autocompleteResults.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onAutocompleteIndexChange((activeAutocompleteIndex + 1) % autocompleteResults.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onAutocompleteIndexChange(activeAutocompleteIndex <= 0 ? autocompleteResults.length - 1 : activeAutocompleteIndex - 1);
              return;
            }
            if (event.key === "Enter" && activeAutocompleteIndex >= 0) {
              event.preventDefault();
              const match = autocompleteResults[activeAutocompleteIndex];
              if (match) onApplySuggestion(match.title);
              return;
            }
            if (event.key === "Escape" && activeAutocompleteIndex >= 0) {
              event.preventDefault();
              onAutocompleteIndexChange(-1);
            }
          }}
          onClear={() => { onSearchQueryChange(""); onAutocompleteIndexChange(-1); }}
          placeholder={t("search.placeholder")}
          aria-label={t("search.ariaLabel")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={autocompleteResults.length > 0}
          aria-controls={SEARCH_AUTOCOMPLETE_LIST_ID}
          aria-activedescendant={
            activeAutocompleteIndex >= 0 && autocompleteResults[activeAutocompleteIndex]
              ? `search-autocomplete-option-${autocompleteResults[activeAutocompleteIndex].id}`
              : undefined
          }
        />

        {showFacetControls ? (
          <div role="group" aria-label={t("search.facetsLabel")} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
            {(["books", "writing", "fediverse"] as const).map((facet) => (
              <button
                key={facet}
                type="button"
                onClick={() => onSearchFacetChange(facet)}
                aria-pressed={searchFacet === facet}
                style={{
                  minHeight: "calc(var(--touch-min) - 10px)",
                  borderRadius: "999px",
                  border: searchFacet === facet
                    ? "1px solid color-mix(in srgb, var(--color-accent) 70%, transparent)"
                    : "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                  background: searchFacet === facet
                    ? "color-mix(in srgb, var(--color-accent) 24%, var(--color-bg))"
                    : "var(--color-bg-secondary)",
                  color: "var(--color-text)",
                  padding: "0 var(--space-3)",
                  fontSize: "var(--text-footnote)",
                  fontWeight: 650,
                  letterSpacing: "0.01em"
                }}
              >
                {t(`search.facets.${facet}`)}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
            {t("search.smartSearchDescription")}
          </p>
        )}

        {autocompleteResults.length > 0 ? (
          <div
            id={SEARCH_AUTOCOMPLETE_LIST_ID}
            role="listbox"
            aria-label={t("search.suggestionsLabel")}
            style={{
              display: "grid",
              gap: "var(--space-2)",
              padding: "var(--space-2)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-bg-secondary)",
              border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)"
            }}
          >
            {autocompleteResults.map((suggestion, index) => (
              <button
                key={suggestion.id}
                id={`search-autocomplete-option-${suggestion.id}`}
                type="button"
                role="option"
                aria-selected={index === activeAutocompleteIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onAutocompleteIndexChange(index)}
                onClick={() => onApplySuggestion(suggestion.title)}
                style={{
                  border: 0,
                  borderRadius: "var(--radius-sm)",
                  minHeight: "calc(var(--touch-min) - 8px)",
                  background: index === activeAutocompleteIndex ? "color-mix(in srgb, var(--color-accent) 20%, var(--color-bg))" : "var(--color-bg)",
                  color: "var(--color-text)",
                  textAlign: "left",
                  padding: "0 var(--space-3)"
                }}
              >
                {suggestion.title}
              </button>
            ))}
          </div>
        ) : null}

        {/* Import section */}
        <div style={{
          display: "grid",
          gap: "var(--space-3)",
          padding: "var(--space-4)",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-bg-secondary)",
          boxShadow: "var(--shadow-card)"
        }}>
          <input
            type="url"
            inputMode="url"
            value={importUrl}
            onChange={(event) => onImportUrlChange(event.target.value)}
            placeholder={t("search.importPlaceholder")}
            aria-label={t("search.importAriaLabel")}
            autoComplete="on"
            spellCheck={false}
            list={IMPORT_URL_DATALIST_ID}
            style={{
              width: "100%",
              minHeight: "var(--touch-min)",
              borderRadius: "var(--radius-md)",
              border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
              padding: "0 var(--space-3)",
              fontSize: "var(--text-body)"
            }}
          />
          <datalist id={IMPORT_URL_DATALIST_ID}>
            {importUrlHints.map((hint) => (
              <option key={hint} value={hint} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={onImport}
            disabled={isImporting || !dbReady || !importUrl.trim()}
            style={{
              minHeight: "var(--touch-min)",
              border: 0,
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent)",
              color: "white",
              fontWeight: 700,
              padding: "0 var(--space-4)",
              opacity: isImporting || !dbReady || !importUrl.trim() ? 0.6 : 1
            }}
          >
            {isImporting ? t("search.importing") : t("search.importEdition")}
          </button>
          {importError ? <p style={{ margin: 0, color: "#c23b3b" }}>{importError}</p> : null}
        </div>
      </section>

      <div style={{ height: "var(--space-6)" }} />

      {/* Local search results */}
      {showLocalSearchResults && searchError ? (
        <p style={{ padding: "0 var(--space-4)", color: "#c23b3b" }}>{searchError}</p>
      ) : null}

      {/* Federated discovery */}
      {showFederatedDiscoveryResults ? (
        <>
          {(discoveryLoading || relayLoading) ? <SkeletonCoverGrid count={3} /> : null}
          {discoveryError ? <p style={{ padding: "0 var(--space-4)", color: "#c23b3b" }}>{discoveryError}</p> : null}
          {relayError ? <p style={{ padding: "0 var(--space-4)", color: "#c23b3b" }}>{relayError}</p> : null}
          {(discoveryStatuses.length > 0 || relayResults.length > 0) ? (
            <section style={{ display: "grid", gap: "var(--space-3)" }}>
              <SectionHeader title={t("search.fediverseDiscovery")} />
              {renderDiscoveryResults({ statuses: discoveryStatuses, relayResults })}
            </section>
          ) : normalizedQuery.length >= 2 && !(discoveryLoading || relayLoading) ? (
            <EmptyState title={t("search.noFederatedResultsTitle")} description={t("search.noFederatedResultsDescription")} />
          ) : null}
        </>
      ) : null}

      {/* Local results */}
      {showLocalSearchResults && isSearching ? <SkeletonCoverGrid count={3} /> : null}
      {showLocalSearchResults && searchResults && searchResults.all.length > 0 ? (
        renderSearchResults({ results: searchResults, query: normalizedQuery, onSelect: onSearchResultSelect })
      ) : showLocalSearchResults && normalizedQuery.length >= 2 && !isSearching ? (
        <EmptyState title={t("search.noResultsTitle")} description={t("search.noResultsDescription")} />
      ) : showLocalSearchResults && importedBooks.length > 0 ? (
        <>
          <SectionHeader title={t("search.importedEditions")} />
          <CoverGrid books={importedBooks} onBookPress={onBookPress} />
        </>
      ) : showLocalSearchResults ? (
        <EmptyState title={t("search.noImportedBooksTitle")} description={t("search.noImportedBooksDescription")} />
      ) : null}
    </PageShell>
  );
}
