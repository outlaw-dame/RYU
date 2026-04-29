import { useCallback, useEffect, useMemo, useState } from "react";
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
import { normalizeSearchQuery } from "../search/query-normalize";
import type { GroupedSearchResults } from "../search/group";
import type { RankedSearchResult } from "../search/types";
import type { SearchExplanation } from "../search/explain";
import { discoverMastodonOAuth, normalizeInstanceOrigin } from "../auth/instance";
import { buildAuthorizeUrl, createPendingAuthTransaction } from "../auth/oauth";
import { clearPendingAuthTransaction, loadPendingAuthTransaction, savePendingAuthTransaction } from "../auth/transaction";
import {
  parseMastodonExchangeRequest,
  parseMastodonExchangeResponse,
  parseMastodonRegisterRequest,
  parseMastodonRegisterResponse
} from "../auth/contracts";
import { useInstanceDiscovery } from "../hooks/useInstanceDiscovery";
import { useAutocomplete } from "../hooks/useAutocomplete";

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

const DEFAULT_MASTODON_REGISTER_ENDPOINT = "/api/auth/mastodon/register";
const DEFAULT_MASTODON_EXCHANGE_ENDPOINT = "/api/auth/mastodon/exchange";
const DEFAULT_MASTODON_SESSION_ENDPOINT = "/api/auth/mastodon/session";
const DEFAULT_MASTODON_REVOKE_ENDPOINT = "/api/auth/mastodon/revoke";

function getOAuthRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

const INSTANCE_DATALIST_ID = "instance-suggestion-list";
const IMPORT_URL_DATALIST_ID = "import-url-suggestion-list";
const SEARCH_AUTOCOMPLETE_LIST_ID = "search-autocomplete-list";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function computeClientBackoffMs(attempt: number, baseMs = 200, capMs = 1800): number {
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1) + jitter);
}

async function fetchWithBackoff(url: string, init: RequestInit, attempts = 3, timeoutMs = 12_000): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      window.clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, computeClientBackoffMs(attempt)));
        continue;
      }

      return response;
    } catch (error) {
      window.clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, computeClientBackoffMs(attempt)));
      }
    }
  }

  throw lastError ?? new Error("Network request failed");
}

type SearchRuntime = {
  searchAll: (query: string, options: { context: { surface: "global" } }) => Promise<unknown>;
  classifyQueryIntent: typeof import("../search/intent").classifyQueryIntent;
  getAdaptiveAlpha: typeof import("../search/weights").getAdaptiveAlpha;
  recordClick: typeof import("../search/feedback").recordClick;
};

type ImportRuntime = {
  getRxDBActivityPubStore: typeof import("../db/activitypub-ingest").getRxDBActivityPubStore;
  ActivityPubResolver: typeof import("../sync/resolver").ActivityPubResolver;
};

let searchRuntimePromise: Promise<SearchRuntime> | null = null;
let importRuntimePromise: Promise<ImportRuntime> | null = null;

function loadSearchRuntime(): Promise<SearchRuntime> {
  if (!searchRuntimePromise) {
    searchRuntimePromise = Promise.all([
      import("../search/search"),
      import("../search/intent"),
      import("../search/weights"),
      import("../search/feedback")
    ]).then(([searchModule, intentModule, weightsModule, feedbackModule]) => ({
      searchAll: searchModule.searchAll,
      classifyQueryIntent: intentModule.classifyQueryIntent,
      getAdaptiveAlpha: weightsModule.getAdaptiveAlpha,
      recordClick: feedbackModule.recordClick
    }));
  }

  return searchRuntimePromise;
}

function loadImportRuntime(): Promise<ImportRuntime> {
  if (!importRuntimePromise) {
    importRuntimePromise = Promise.all([
      import("../db/activitypub-ingest"),
      import("../sync/resolver")
    ]).then(([ingestModule, resolverModule]) => ({
      getRxDBActivityPubStore: ingestModule.getRxDBActivityPubStore,
      ActivityPubResolver: resolverModule.ActivityPubResolver
    }));
  }

  return importRuntimePromise;
}

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
  const [activeAutocompleteIndex, setActiveAutocompleteIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [instanceInput, setInstanceInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [instanceSearch, setInstanceSearch] = useState("");
  const [preferredSoftware, setPreferredSoftware] = useState<string>("bookwyrm");
  const [preferredCountry, setPreferredCountry] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isAuthWorking, setIsAuthWorking] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<{ instanceOrigin: string; acct: string } | null>(null);
  const { state } = useDatabase();
  const autocompleteResults = useAutocomplete(searchQuery);
  const preferredSoftwareSlugs = useMemo(() => (preferredSoftware ? [preferredSoftware] : []), [preferredSoftware]);
  const {
    instances: signupInstances,
    loading: signupInstancesLoading,
    error: signupInstancesError,
    refresh: refreshSignupInstances,
    refreshedAt: signupInstancesRefreshedAt
  } = useInstanceDiscovery({
    signupOnly: true,
    mastodonApiCompatibleOnly: true,
    preferredSoftwareSlugs,
    preferredCountry,
    searchQuery: instanceSearch,
    limit: 80
  });
  const { books: importedBooks, loading: importedBooksLoading, reload: reloadImportedBooks } = useImportedBooks(state === "ready");
  const changeTab = useCallback((tab: TabId) => setActiveTab(tab), []);
  const featuredBooks = importedBooks.length > 0 ? importedBooks : sampleBooks;

  // Restore session state from the server-side session cookie on mount.
  useEffect(() => {
    let cancelled = false;
    const endpoint = import.meta.env.VITE_MASTODON_AUTH_SESSION_ENDPOINT ?? DEFAULT_MASTODON_SESSION_ENDPOINT;

    void fetch(endpoint)
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const data = await r.json() as { connected?: boolean; instanceOrigin?: string; account?: { acct: string } | null };
        if (!cancelled && data.connected && data.instanceOrigin && data.account?.acct) {
          setConnectedAccount({ instanceOrigin: data.instanceOrigin, acct: data.account.acct });
          setAuthInfo(`Connected as ${data.account.acct}`);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const callbackUrl = new URL(window.location.href);
    const code = callbackUrl.searchParams.get("code");
    const returnedState = callbackUrl.searchParams.get("state");
    const oauthError = callbackUrl.searchParams.get("error");

    if (!code && !oauthError) {
      return;
    }

    const pending = loadPendingAuthTransaction();
    if (!pending) {
      if (!cancelled) {
        setAuthError("Authentication callback was received, but no active login transaction was found.");
      }
      return () => {
        cancelled = true;
      };
    }

    if (oauthError) {
      if (!cancelled) {
        setAuthError(`Authorization failed: ${oauthError}`);
      }
      clearPendingAuthTransaction();
      callbackUrl.search = "";
      window.history.replaceState({}, "", callbackUrl.toString());
      return () => {
        cancelled = true;
      };
    }

    if (!returnedState || returnedState !== pending.state) {
      if (!cancelled) {
        setAuthError("State validation failed. Please retry login.");
      }
      clearPendingAuthTransaction();
      callbackUrl.search = "";
      window.history.replaceState({}, "", callbackUrl.toString());
      return () => {
        cancelled = true;
      };
    }

    if (!cancelled) {
      setIsAuthWorking(true);
      setAuthError(null);
      setAuthInfo("Authorization callback validated. Exchanging code...");
    }

    const exchangeEndpoint = import.meta.env.VITE_MASTODON_AUTH_EXCHANGE_ENDPOINT ?? DEFAULT_MASTODON_EXCHANGE_ENDPOINT;
    const exchangePayload = parseMastodonExchangeRequest({
      instanceOrigin: pending.instanceOrigin,
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri
    });

    void (async () => {
      try {
        const response = await fetchWithBackoff(exchangeEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(exchangePayload)
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Exchange failed (${response.status})`);
        }

        const payload = parseMastodonExchangeResponse(await response.json());
        const accountText = payload.account ? ` as ${payload.account.acct}` : "";
        if (!cancelled) {
          setAuthInfo(`Account connected${accountText}. Token exchange completed.`);
          if (payload.account && payload.instanceOrigin) {
            setConnectedAccount({ instanceOrigin: payload.instanceOrigin, acct: payload.account.acct });
          }
        }
        clearPendingAuthTransaction();
      } catch (error: unknown) {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsAuthWorking(false);
        }
        callbackUrl.search = "";
        window.history.replaceState({}, "", callbackUrl.toString());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
      void loadSearchRuntime()
        .then(({ searchAll }) => searchAll(query, { context: { surface: "global" } }))
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

    void loadSearchRuntime().then(({ classifyQueryIntent, getAdaptiveAlpha, recordClick }) => {
      const intent = classifyQueryIntent(query);
      const alpha = getAdaptiveAlpha(intent.alpha, intent.intent);
      recordClick(query, result.id, intent.intent, alpha);
    });
  }, [searchQuery]);

  const visibleAutocompleteResults = useMemo(() => {
    if (normalizeSearchQuery(searchQuery).length < 2) {
      return [];
    }
    return autocompleteResults.slice(0, 6);
  }, [autocompleteResults, searchQuery]);

  const applySearchSuggestion = useCallback((title: string) => {
    setSearchQuery(title);
    setActiveAutocompleteIndex(-1);
  }, []);

  useEffect(() => {
    setActiveAutocompleteIndex((current) => {
      if (visibleAutocompleteResults.length === 0) {
        return -1;
      }
      if (current >= visibleAutocompleteResults.length) {
        return visibleAutocompleteResults.length - 1;
      }
      return current;
    });
  }, [visibleAutocompleteResults]);

  const importBook = useCallback(async () => {
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl || state !== "ready") return;

    setIsImporting(true);
    setImportError(null);
    try {
      const { getRxDBActivityPubStore, ActivityPubResolver } = await loadImportRuntime();
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

  const startMastodonLogin = useCallback(async () => {
    setAuthError(null);
    setAuthInfo(null);

    let normalizedInstance = "";
    try {
      normalizedInstance = normalizeInstanceOrigin(instanceInput);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
      return;
    }

    setIsAuthWorking(true);
    try {
      const discovery = await discoverMastodonOAuth(normalizedInstance);
      const redirectUri = getOAuthRedirectUri();
      const registerEndpoint = import.meta.env.VITE_MASTODON_AUTH_REGISTER_ENDPOINT ?? DEFAULT_MASTODON_REGISTER_ENDPOINT;
      const registerPayload = parseMastodonRegisterRequest({
        instanceOrigin: discovery.instanceOrigin,
        redirectUris: [redirectUri],
        scopes: discovery.scopeDecision.requestedScopes
      });

      const registerResponse = await fetchWithBackoff(registerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerPayload)
      });

      if (!registerResponse.ok) {
        const body = await registerResponse.text();
        throw new Error(body || `App registration failed (${registerResponse.status})`);
      }

      const app = parseMastodonRegisterResponse(await registerResponse.json());
      if (!app.clientId) {
        throw new Error("App registration response did not include a clientId.");
      }

      const transaction = await createPendingAuthTransaction({
        instanceOrigin: discovery.instanceOrigin,
        requestedScopes: discovery.scopeDecision.requestedScopes,
        redirectUri
      });

      savePendingAuthTransaction({
        instanceOrigin: transaction.instanceOrigin,
        state: transaction.state,
        codeVerifier: transaction.codeVerifier,
        requestedScopes: transaction.requestedScopes,
        redirectUri: transaction.redirectUri,
        createdAt: transaction.createdAt
      });

      if (!discovery.supportsPkceS256 && discovery.discovered) {
        setAuthInfo("This instance did not report S256 PKCE in metadata. Proceeding with standards-based parameters.");
      } else if (discovery.fallbackReason) {
        setAuthInfo(`OAuth metadata fallback in use: ${discovery.fallbackReason}`);
      }

      const authorizeUrl = buildAuthorizeUrl({
        authorizationEndpoint: discovery.endpoints.authorization,
        clientId: app.clientId,
        redirectUri,
        authScope: transaction.authScope,
        state: transaction.state,
        codeChallenge: transaction.codeChallenge,
        forceLogin: true
      });

      window.location.assign(authorizeUrl);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAuthWorking(false);
    }
  }, [instanceInput]);

  const disconnectMastodon = useCallback(async () => {
    setIsAuthWorking(true);
    setAuthError(null);
    try {
      const endpoint = import.meta.env.VITE_MASTODON_AUTH_REVOKE_ENDPOINT ?? DEFAULT_MASTODON_REVOKE_ENDPOINT;
      await fetchWithBackoff(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      setConnectedAccount(null);
      setAuthInfo(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAuthWorking(false);
    }
  }, []);

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    for (const instance of signupInstances) {
      if (instance.country) set.add(instance.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [signupInstances]);

  const topAutocompleteInstances = useMemo(() => signupInstances.slice(0, 20), [signupInstances]);
  const importUrlHints = useMemo(
    () => topAutocompleteInstances.map((instance) => `https://${instance.domain}/book/`),
    [topAutocompleteInstances]
  );

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
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setActiveAutocompleteIndex(-1);
                      }}
                      onKeyDown={(event) => {
                        if (!visibleAutocompleteResults.length) {
                          return;
                        }

                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setActiveAutocompleteIndex((current) => (current + 1) % visibleAutocompleteResults.length);
                          return;
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setActiveAutocompleteIndex((current) => {
                            if (current <= 0) {
                              return visibleAutocompleteResults.length - 1;
                            }
                            return current - 1;
                          });
                          return;
                        }

                        if (event.key === "Enter" && activeAutocompleteIndex >= 0) {
                          event.preventDefault();
                          const match = visibleAutocompleteResults[activeAutocompleteIndex];
                          if (match) {
                            applySearchSuggestion(match.title);
                          }
                          return;
                        }

                        if (event.key === "Escape" && activeAutocompleteIndex >= 0) {
                          event.preventDefault();
                          setActiveAutocompleteIndex(-1);
                        }
                      }}
                      placeholder="Search books, authors, ISBNs, themes..."
                      aria-label="Search library"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={visibleAutocompleteResults.length > 0}
                      aria-controls={SEARCH_AUTOCOMPLETE_LIST_ID}
                      aria-activedescendant={
                        activeAutocompleteIndex >= 0 && visibleAutocompleteResults[activeAutocompleteIndex]
                          ? `search-autocomplete-option-${visibleAutocompleteResults[activeAutocompleteIndex].id}`
                          : undefined
                      }
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
                    {visibleAutocompleteResults.length > 0 ? (
                      <div
                        id={SEARCH_AUTOCOMPLETE_LIST_ID}
                        role="listbox"
                        aria-label="Search suggestions"
                        style={{
                        display: "grid",
                        gap: "var(--space-2)",
                        padding: "var(--space-2)",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-bg-secondary)",
                        border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)"
                      }}>
                        {visibleAutocompleteResults.map((suggestion, index) => (
                          <button
                            key={suggestion.id}
                            id={`search-autocomplete-option-${suggestion.id}`}
                            type="button"
                            role="option"
                            aria-selected={index === activeAutocompleteIndex}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveAutocompleteIndex(index)}
                            onClick={() => applySearchSuggestion(suggestion.title)}
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
                  <ScreenTitle title="Profile" />
                  <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
                    <div style={{
                      display: "grid",
                      gap: "var(--space-3)",
                      padding: "var(--space-4)",
                      borderRadius: "var(--radius-lg)",
                      background: "var(--color-bg-secondary)",
                      boxShadow: "var(--shadow-card)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
                        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                          Signup picker: open-registration, Mastodon API compatible, Oliphant Tier 0 filtered, ranked by preference.
                        </p>
                        <div style={{ display: "flex", gap: "var(--space-2)" }}>
                          <button
                            type="button"
                            onClick={() => void refreshSignupInstances(true)}
                            disabled={signupInstancesLoading}
                            style={{
                              border: 0,
                              borderRadius: "var(--radius-sm)",
                              minHeight: "calc(var(--touch-min) - 8px)",
                              background: "var(--color-bg)",
                              color: "var(--color-text)",
                              padding: "0 var(--space-3)",
                              fontSize: "var(--text-footnote)",
                              opacity: signupInstancesLoading ? 0.6 : 1
                            }}
                          >
                            {signupInstancesLoading ? "Refreshing..." : "Refresh"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerOpen(true)}
                            style={{
                              border: 0,
                              borderRadius: "var(--radius-sm)",
                              minHeight: "calc(var(--touch-min) - 8px)",
                              background: "var(--color-accent)",
                              color: "white",
                              padding: "0 var(--space-3)",
                              fontSize: "var(--text-footnote)",
                              fontWeight: 600
                            }}
                          >
                            Browse
                          </button>
                        </div>
                      </div>
                      {signupInstancesError ? (
                        <p style={{ margin: 0, color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
                          Instance discovery issue: {signupInstancesError}
                        </p>
                      ) : null}
                      {signupInstances.length === 0 ? (
                        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                          {signupInstancesLoading ? "Loading eligible instances..." : "No eligible instances found right now."}
                        </p>
                      ) : null}
                      {signupInstancesRefreshedAt ? (
                        <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                          Last refreshed: {new Date(signupInstancesRefreshedAt).toLocaleString()}
                        </p>
                      ) : null}
                      {connectedAccount !== null ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--text-subhead)", color: "var(--color-text)" }}>
                            {connectedAccount.acct}
                          </p>
                          <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-footnote)" }}>
                            {connectedAccount.instanceOrigin}
                          </p>
                          <button
                            type="button"
                            onClick={() => void disconnectMastodon()}
                            disabled={isAuthWorking}
                            style={{
                              minHeight: "var(--touch-min)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 20%, transparent)",
                              borderRadius: "var(--radius-md)",
                              background: "transparent",
                              color: "var(--color-text)",
                              fontWeight: 700,
                              padding: "0 var(--space-4)",
                              opacity: isAuthWorking ? 0.6 : 1
                            }}
                          >
                            {isAuthWorking ? "Disconnecting..." : "Disconnect account"}
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                            Connect your Mastodon or BookWyrm account through OAuth Authorization Code + PKCE.
                          </p>
                          <input
                            type="text"
                            value={instanceInput}
                            onChange={(event) => setInstanceInput(event.target.value)}
                            placeholder="bookwyrm.social"
                            aria-label="BookWyrm or Mastodon instance"
                            autoComplete="on"
                            spellCheck={false}
                            list={INSTANCE_DATALIST_ID}
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
                          <datalist id={INSTANCE_DATALIST_ID}>
                            {topAutocompleteInstances.map((instance) => (
                              <option key={instance.domain} value={instance.domain} label={`${instance.softwareName ?? "Fediverse"}${instance.country ? ` • ${instance.country}` : ""}`} />
                            ))}
                          </datalist>
                          <button
                            type="button"
                            onClick={() => void startMastodonLogin()}
                            disabled={isAuthWorking || !instanceInput.trim()}
                            style={{
                              minHeight: "var(--touch-min)",
                              border: 0,
                              borderRadius: "var(--radius-md)",
                              background: "var(--color-accent)",
                              color: "white",
                              fontWeight: 700,
                              padding: "0 var(--space-4)",
                              opacity: isAuthWorking || !instanceInput.trim() ? 0.6 : 1
                            }}
                          >
                            {isAuthWorking ? "Working..." : "Connect account"}
                          </button>
                        </>
                      )}
                      {authInfo ? <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>{authInfo}</p> : null}
                      {authError ? <p style={{ margin: 0, color: "#c23b3b", fontSize: "var(--text-footnote)" }}>{authError}</p> : null}
                    </div>
                    <EmptyState
                      title="Backend exchange required"
                      description="Mastodon currently provisions confidential clients, so token exchange must run on a backend endpoint and never in browser-only code."
                    />
                  </section>
                  {pickerOpen ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label="Instance picker"
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "color-mix(in srgb, var(--color-bg) 70%, black 30%)",
                        display: "grid",
                        placeItems: "center",
                        padding: "var(--space-4)",
                        zIndex: 40
                      }}
                      onClick={() => setPickerOpen(false)}
                    >
                      <section
                        onClick={(event) => event.stopPropagation()}
                        style={{
                          width: "min(760px, 100%)",
                          maxHeight: "80dvh",
                          overflow: "hidden",
                          background: "var(--color-bg-elevated)",
                          borderRadius: "var(--radius-xl)",
                          boxShadow: "var(--shadow-card)",
                          display: "grid",
                          gridTemplateRows: "auto auto 1fr auto",
                          gap: "var(--space-3)",
                          padding: "var(--space-4)"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
                          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-title3)" }}>Choose instance</h2>
                          <button
                            type="button"
                            onClick={() => setPickerOpen(false)}
                            style={{
                              border: 0,
                              borderRadius: "var(--radius-sm)",
                              background: "var(--color-bg-secondary)",
                              color: "var(--color-text)",
                              minHeight: "calc(var(--touch-min) - 10px)",
                              padding: "0 var(--space-3)"
                            }}
                          >
                            Close
                          </button>
                        </div>
                        <div style={{ display: "grid", gap: "var(--space-2)" }}>
                          <input
                            type="search"
                            value={instanceSearch}
                            onChange={(event) => setInstanceSearch(event.target.value)}
                            placeholder="Search domain, software, country"
                            aria-label="Search instances"
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
                          <select
                            value={preferredSoftware}
                            onChange={(event) => setPreferredSoftware(event.target.value)}
                            aria-label="Preferred software"
                            style={{
                              minHeight: "var(--touch-min)",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                              background: "var(--color-bg)",
                              color: "var(--color-text)",
                              padding: "0 var(--space-2)"
                            }}
                          >
                            <option value="bookwyrm">Prefer BookWyrm</option>
                            <option value="mastodon">Prefer Mastodon</option>
                            <option value="">No preference</option>
                          </select>
                          <select
                            value={preferredCountry}
                            onChange={(event) => setPreferredCountry(event.target.value)}
                            aria-label="Preferred country"
                            style={{
                              minHeight: "var(--touch-min)",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                              background: "var(--color-bg)",
                              color: "var(--color-text)",
                              padding: "0 var(--space-2)"
                            }}
                          >
                            <option value="">Any country</option>
                            {availableCountries.map((country) => (
                              <option key={country} value={country}>{country}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ overflowY: "auto", display: "grid", gap: "var(--space-2)", paddingRight: "var(--space-1)" }}>
                          {signupInstances.map((instance) => (
                            <button
                              key={instance.domain}
                              type="button"
                              onClick={() => {
                                setInstanceInput(instance.domain);
                                setPickerOpen(false);
                              }}
                              style={{
                                border: 0,
                                borderRadius: "var(--radius-md)",
                                minHeight: "calc(var(--touch-min) - 6px)",
                                background: "var(--color-bg-secondary)",
                                color: "var(--color-text)",
                                padding: "var(--space-2) var(--space-3)",
                                textAlign: "left",
                                display: "grid",
                                gap: "2px"
                              }}
                            >
                              <span style={{ fontWeight: 700 }}>{instance.domain}</span>
                              <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-caption1)" }}>
                                {instance.softwareName ?? "Fediverse"}
                                {instance.country ? ` · ${instance.country}` : ""}
                                {typeof instance.userCount === "number" ? ` · ${instance.userCount.toLocaleString()} users` : ""}
                              </span>
                            </button>
                          ))}
                          {!signupInstancesLoading && signupInstances.length === 0 ? (
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>No matches for current filters.</p>
                          ) : null}
                        </div>
                        <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                          Only open-registration instances are shown. Oliphant Tier 0 domains are excluded.
                        </p>
                      </section>
                    </div>
                  ) : null}
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
