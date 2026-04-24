import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { AppTabBar, type TabId } from "../components/layout/AppTabBar";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { OfflineIndicator } from "../components/common/OfflineIndicator";
import { EmptyState } from "../components/common/EmptyState";
import { CoverGrid } from "../components/common/CoverGrid";
import { SectionHeader } from "../components/common/SectionHeader";
import { SkeletonCoverGrid } from "../components/common/Skeleton";
import { useDatabase } from "../hooks/useDatabase";
import { useImportedBooks } from "../hooks/useImportedBooks";
import { ActivityPubResolver } from "../sync/resolver";

const sampleBooks = [
  { id: "1", title: "Kafka on the Shore", author: "Haruki Murakami", coverUrl: "https://covers.openlibrary.org/b/isbn/9781400079278-M.jpg" },
  { id: "2", title: "Dune", author: "Frank Herbert", coverUrl: "https://covers.openlibrary.org/b/isbn/9780441013593-M.jpg" },
  { id: "3", title: "Piranesi", author: "Susanna Clarke", coverUrl: "https://covers.openlibrary.org/b/isbn/9781635575996-M.jpg" },
  { id: "4", title: "Project Hail Mary", author: "Andy Weir", coverUrl: "https://covers.openlibrary.org/b/isbn/9780593135204-M.jpg" },
  { id: "5", title: "The Dispossessed", author: "Ursula K. Le Guin", coverUrl: "https://covers.openlibrary.org/b/isbn/9780061054884-M.jpg" },
  { id: "6", title: "Exhalation", author: "Ted Chiang", coverUrl: "https://covers.openlibrary.org/b/isbn/9781101947883-M.jpg" }
];

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

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { state } = useDatabase();
  const { books: importedBooks, loading: importedBooksLoading, reload: reloadImportedBooks } = useImportedBooks(state === "ready");
  const changeTab = useCallback((tab: TabId) => setActiveTab(tab), []);
  const resolver = useMemo(() => new ActivityPubResolver(), []);

  const featuredBooks = importedBooks.length > 0 ? importedBooks : sampleBooks;

  const importBook = useCallback(async () => {
    if (!importUrl.trim()) return;

    setIsImporting(true);
    setImportError(null);
    try {
      await resolver.importEditionFromUrl(importUrl);
      setImportUrl("");
      await reloadImportedBooks();
      setActiveTab("home");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  }, [importUrl, reloadImportedBooks, resolver]);

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
                    <div style={{
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--space-4)",
                      background: "var(--color-bg-secondary)",
                      boxShadow: "var(--shadow-card)"
                    }}>
                      <h2 style={{ margin: "0 0 var(--space-2)", fontFamily: "var(--font-display)", fontSize: "var(--text-title3)", lineHeight: "var(--leading-title3)" }}>Import a BookWyrm edition</h2>
                      <p style={{ margin: "0 0 var(--space-3)", color: "var(--color-text-secondary)" }}>Paste a public ActivityPub Edition URL. The app will fetch, validate, normalize, and store it locally.</p>
                      <div style={{ display: "grid", gap: "var(--space-3)" }}>
                        <input
                          type="url"
                          inputMode="url"
                          value={importUrl}
                          onChange={(event) => setImportUrl(event.target.value)}
                          placeholder="https://bookwyrm.example/book/edition/123"
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
                          disabled={isImporting || state !== "ready"}
                          style={{
                            minHeight: "var(--touch-min)",
                            border: 0,
                            borderRadius: "var(--radius-md)",
                            background: "var(--color-accent)",
                            color: "white",
                            fontWeight: 700,
                            padding: "0 var(--space-4)",
                            opacity: isImporting || state !== "ready" ? 0.6 : 1
                          }}
                        >
                          {isImporting ? "Importing..." : "Import edition"}
                        </button>
                      </div>
                      {importError ? <p style={{ margin: "var(--space-3) 0 0", color: "#c23b3b" }}>{importError}</p> : null}
                    </div>
                  </section>
                  <div style={{ height: "var(--space-6)" }} />
                  {importedBooks.length > 0 ? (
                    <>
                      <SectionHeader title="Imported Editions" />
                      <CoverGrid books={importedBooks} />
                    </>
                  ) : (
                    <EmptyState title="No imported books yet" description="Your first successful import will appear here and on the Home tab." />
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
                  <ScreenTitle title="Profile" />
                  <EmptyState title="Connect BookWyrm" description="Authentication is planned for Phase 3 after the API compatibility audit." />
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
