import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { AppTabBar, type TabId } from "../components/layout/AppTabBar";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { OfflineIndicator } from "../components/common/OfflineIndicator";
import { EmptyState } from "../components/common/EmptyState";
import { CoverGrid } from "../components/common/CoverGrid";
import { SectionHeader } from "../components/common/SectionHeader";
import { SkeletonCoverGrid } from "../components/common/Skeleton";
import { SettingsScreen } from "../components/settings/SettingsScreen";
import { getRxDBActivityPubStore } from "../db/activitypub-ingest";
import { useDatabase } from "../hooks/useDatabase";
import { useImportedBooks } from "../hooks/useImportedBooks";
import { ActivityPubResolver } from "../sync/resolver";
import { searchAll } from "../search/search";
import { classifyQueryIntent } from "../search/intent";
import { getAdaptiveAlpha } from "../search/weights";
import { recordClick } from "../search/feedback";
import { normalizeSearchQuery } from "../search/query-normalize";
import type { GroupedSearchResults } from "../search/group";
import type { RankedSearchResult } from "../search/types";
import type { SearchExplanation } from "../search/explain";

const sampleBooks = [
  { id: "1", title: "Kafka on the Shore", author: "Haruki Murakami", coverUrl: "https://covers.openlibrary.org/b/isbn/9781400079278-M.jpg" },
  { id: "2", title: "Dune", author: "Frank Herbert", coverUrl: "https://covers.openlibrary.org/b/isbn/9780441013593-M.jpg" },
  { id: "3", title: "Piranesi", author: "Susanna Clarke", coverUrl: "https://covers.openlibrary.org/b/isbn/9781635575996-M.jpg" },
  { id: "4", title: "Project Hail Mary", author: "Andy Weir", coverUrl: "https://covers.openlibrary.org/b/isbn/9780593135204-M.jpg" },
  { id: "5", title: "The Dispossessed", author: "Ursula K. Le Guin", coverUrl: "https://covers.openlibrary.org/b/isbn/9780061054884-M.jpg" },
  { id: "6", title: "Exhalation", author: "Ted Chiang", coverUrl: "https://covers.openlibrary.org/b/isbn/9781101947883-M.jpg" }
];

type ExplainedSearchResult = RankedSearchResult & { explanation?: SearchExplanation };
type ExplainedGroupedResults = GroupedSearchResults<ExplainedSearchResult>;

function TabPanel({ id, activeTab, children }: { id: TabId; activeTab: TabId; children: React.ReactNode }) {
  return (
    <motion.section
      key={id}
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={activeTab !== id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="scroll-container"
      style={{
        height: "100%",
        paddingTop: "var(--safe-top)",
        paddingBottom: "calc(var(--space-8) + var(--safe-bottom))"
      }}
    >
      {children}
    </motion.section>
  );
}

function ScreenTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <header style={{ padding: "0 var(--space-4) var(--space-6)" }}>
      {eyebrow ? (
        <div style={{
          fontSize: "var(--text-subhead)",
          lineHeight: "var(--leading-subhead)",
          letterSpacing: "var(--tracking-subhead)",
          color: "var(--color-text-tertiary)",
          marginBottom: "var(--space-1)"
        }}>{eyebrow}</div>
      ) : null}
      <h1 style={{
        margin: 0,
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-large-title)",
        lineHeight: "var(--leading-large-title)",
        letterSpacing: "var(--tracking-large-title)",
        fontWeight: 700,
        color: "var(--color-text)"
      }}>{title}</h1>
    </header>
  );
}

function SearchResultRow({
  result,
  query,
  onSelect
}: {
  result: ExplainedSearchResult;
  query: string;
  onSelect: (result: ExplainedSearchResult) => void;
}) {
  const select = () => onSelect(result);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      style={{
        width: "100%",
        textAlign: "left",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-secondary)",
        color: "var(--color-text)",
        padding: "var(--space-4)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gap: "var(--space-2)",
        cursor: "pointer",
        outlineOffset: "3px"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-headline)" }}>{result.title}</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)", textTransform: "uppercase" }}>{result.type}</span>
      </div>
      {result.authorText ? <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-subhead)" }}>{result.authorText}</div> : null}
      {result.description ? <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: 1.35 }}>{result.description.slice(0, 180)}</p> : null}
      {import.meta.env.DEV && result.explanation ? (
        <details onClick={(event) => event.stopPropagation()} style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)" }}>
          <summary>Why this result?</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "var(--space-2) 0 0" }}>
            {JSON.stringify({
              query,
              score: result.score,
              reasons: result.explanation.reasons,
              intent: result.explanation.intent.intent,
              alpha: result.explanation.appliedAlpha,
              stages: result.explanation.stages
            }, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

function SearchResultsSection({
  title,
  query,
  results,
  onSelect
}: {
  title: string;
  query: string;
  results: ExplainedSearchResult[];
  onSelect: (result: ExplainedSearchResult) => void;
}) {
  if (!results.length) return null;

  return (
    <section style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionHeader title={title} />
      <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
        {results.map((result) => (
          <SearchResultRow key={result.id} result={result} query={query} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [importUrl, setImportUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExplainedGroupedResults | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { state } = useDatabase();
  const { books: importedBooks, loading: importedBooksLoading, reload: reloadImportedBooks } = useImportedBooks(state === "ready");
  const changeTab = useCallback((tab: TabId) => setActiveTab(tab), []);
  const featuredBooks = importedBooks.length > 0 ? importedBooks : sampleBooks;

  useEffect(() => {
    const query = normalizeSearchQuery(searchQuery);

    if (query.length < 2 || state !== "ready") {
      setSearchResults(null);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    const timeout = window.setTimeout(() => {
      void searchAll(query, { context: { surface: "global" } })
        .then((results) => {
          if (!cancelled) setSearchResults(results as ExplainedGroupedResults | null);
        })
        .catch((error) => {
          if (!cancelled) {
            setSearchResults(null);
            setSearchError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchQuery, state]);

  const handleSearchResultSelect = useCallback((result: ExplainedSearchResult) => {
    const query = normalizeSearchQuery(searchQuery);
    if (!query) return;

    const intent = classifyQueryIntent(query);
    const alpha = getAdaptiveAlpha(intent.alpha, intent.intent);
    recordClick(query, result.id, intent.intent, alpha);
  }, [searchQuery]);

  const importBook = useCallback(async () => {
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl || state !== "ready") return;

    setIsImporting(true);
    setImportError(null);
    try {
      const store = await getRxDBActivityPubStore();
      const resolver = new ActivityPubResolver(store);
      await resolver.importEditionFromUrl(trimmedUrl);
      setImportUrl("");
      await reloadImportedBooks();
      setActiveTab("home");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  }, [importUrl, reloadImportedBooks, state]);

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <div style={{
          width: "100%",
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          overflow: "hidden"
        }}>
          <OfflineIndicator />
          <main style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
            <AnimatePresence mode="wait">
              {activeTab === "home" && (
                <TabPanel id="home" activeTab={activeTab}>
                  <ScreenTitle eyebrow="Good evening" title="My Library" />
                  <SectionHeader title="Currently Reading" actionLabel="See All" />
                  {state === "ready" && !importedBooksLoading ? <CoverGrid books={featuredBooks.slice(0, 3)} /> : <SkeletonCoverGrid count={3} />}
                  <div style={{ height: "var(--space-8)" }} />
                  <SectionHeader title={importedBooks.length > 0 ? "Imported From BookWyrm" : "Recently Added"} />
                  <CoverGrid books={featuredBooks.slice(3).length > 0 ? featuredBooks.slice(3, 9) : featuredBooks.slice(0, 6)} />
                </TabPanel>
              )}
              {activeTab === "search" && (
                <TabPanel id="search" activeTab={activeTab}>
                  <ScreenTitle title="Search" />
                  <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search books, authors, ISBNs, themes..."
                      aria-label="Search library"
                      style={{
                        width: "100%",
                        minHeight: "var(--touch-min)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                        background: "var(--color-bg-secondary)",
                        color: "var(--color-text)",
                        padding: "0 var(--space-3)",
                        fontSize: "var(--text-body)"
                      }}
                    />
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
                        onChange={(event) => setImportUrl(event.target.value)}
                        placeholder="https://bookwyrm.social/book/..."
                        aria-label="BookWyrm edition URL"
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
                      <button
                        type="button"
                        onClick={() => void importBook()}
                        disabled={isImporting || state !== "ready" || !importUrl.trim()}
                        style={{
                          minHeight: "var(--touch-min)",
                          border: 0,
                          borderRadius: "var(--radius-md)",
                          background: "var(--color-accent)",
                          color: "white",
                          fontWeight: 700,
                          padding: "0 var(--space-4)",
                          opacity: isImporting || state !== "ready" || !importUrl.trim() ? 0.6 : 1
                        }}
                      >
                        {isImporting ? "Importing..." : "Import edition"}
                      </button>
                      {importError ? <p style={{ margin: 0, color: "#c23b3b" }}>{importError}</p> : null}
                    </div>
                  </section>
                  <div style={{ height: "var(--space-6)" }} />
                  {searchError ? <p style={{ padding: "0 var(--space-4)", color: "#c23b3b" }}>{searchError}</p> : null}
                  {isSearching ? <SkeletonCoverGrid count={3} /> : null}
                  {searchResults && searchResults.all.length > 0 ? (
                    <div style={{ display: "grid", gap: "var(--space-6)" }}>
                      <SearchResultsSection title="Editions" query={normalizeSearchQuery(searchQuery)} results={searchResults.editions} onSelect={handleSearchResultSelect} />
                      <SearchResultsSection title="Works" query={normalizeSearchQuery(searchQuery)} results={searchResults.works} onSelect={handleSearchResultSelect} />
                      <SearchResultsSection title="Authors" query={normalizeSearchQuery(searchQuery)} results={searchResults.authors} onSelect={handleSearchResultSelect} />
                    </div>
                  ) : normalizeSearchQuery(searchQuery).length >= 2 && !isSearching ? (
                    <EmptyState title="No results" description="Try another title, author, ISBN, or theme." />
                  ) : importedBooks.length > 0 ? (
                    <>
                      <SectionHeader title="Imported Editions" />
                      <CoverGrid books={importedBooks} />
                    </>
                  ) : (
                    <EmptyState title="No imported books yet" description="BookWyrm editions you import will appear here." />
                  )}
                </TabPanel>
              )}
              {activeTab === "shelves" && (
                <TabPanel id="shelves" activeTab={activeTab}>
                  <ScreenTitle title="Shelves" />
                  <CoverGrid books={sampleBooks} />
                </TabPanel>
              )}
              {activeTab === "activity" && (
                <TabPanel id="activity" activeTab={activeTab}>
                  <ScreenTitle title="Activity" />
                  <EmptyState title="No activity yet" description="Reviews, follows, favourites, and reading updates will appear here." />
                </TabPanel>
              )}
              {activeTab === "profile" && (
                <TabPanel id="profile" activeTab={activeTab}>
                  <ScreenTitle title="Settings" />
                  <SettingsScreen />
                </TabPanel>
              )}
            </AnimatePresence>
          </main>
          <AppTabBar activeTab={activeTab} onChange={changeTab} />
        </div>
      </ErrorBoundary>
    </MotionConfig>
  );
}
