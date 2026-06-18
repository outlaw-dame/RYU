/**
 * Phase 25 - useAccountConnection hook.
 *
 * Encapsulates all account connection state: instance input, OAuth flow,
 * instance picker, callback detection, and connected account detection.
 *
 * Extracted from the inlined Profile tab logic in App.tsx so the onboarding
 * flow can be self-contained and testable.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeInstanceOrigin, discoverMastodonOAuth } from "../auth/instance";
import { buildAuthorizeUrl, createPendingAuthTransaction } from "../auth/oauth";
import {
  clearPendingAuthTransaction,
  loadPendingAuthTransaction,
  savePendingAuthTransaction
} from "../auth/transaction";
import {
  parseMastodonExchangeRequest,
  parseMastodonExchangeResponse,
  parseMastodonRegisterRequest,
  parseMastodonRegisterResponse
} from "../auth/contracts";
import {
  useMastodonSession,
  useDisconnectMastodon,
  mastodonActivityQueryKeys
} from "../sync/use-mastodon-activity";

export type ConnectedAccountInfo = {
  instanceOrigin: string;
  acct: string;
  displayName?: string;
  avatar?: string;
  profileUrl?: string;
  grantedScopes?: string[];
};

export type AccountConnectionState = {
  /** Current instance input value. */
  instanceInput: string;
  /** Update instance input. */
  setInstanceInput: (value: string) => void;
  /** Whether the OAuth flow is in progress. */
  isWorking: boolean;
  /** User-facing error from the auth flow. */
  error: string | null;
  /** Informational message (e.g. fallback notice). */
  info: string | null;
  /** Clear any current error. */
  clearError: () => void;
  /** Whether the instance picker dialog is open. */
  pickerOpen: boolean;
  /** Open the instance picker. */
  openPicker: () => void;
  /** Close the instance picker. */
  closePicker: () => void;
  /** Start OAuth login flow for the current instanceInput, or an optional override instance. */
  startLogin: (overrideInstance?: string) => Promise<void>;
  /** Apply a discovered instance domain to the input and close the picker. */
  applyInstance: (domain: string) => void;
  /** Connected account info, or null if not connected. */
  connectedAccount: ConnectedAccountInfo | null;
  /** Whether the session is still loading. */
  isLoadingSession: boolean;
  /** Disconnect the current account. */
  disconnect: () => Promise<void>;
  /** Whether disconnect is in progress. */
  isDisconnecting: boolean;
  /** Retry the last failed action. */
  retry: () => void;
};

const DEFAULT_MASTODON_REGISTER_ENDPOINT = "/api/auth/mastodon/register";
const DEFAULT_MASTODON_EXCHANGE_ENDPOINT = "/api/auth/mastodon/exchange";

function getOAuthRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3, timeoutMs = 12_000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status) || attempt === attempts) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === attempts) break;
    } finally {
      clearTimeout(timer);
    }
    const backoff = Math.min(1800, 200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 120));
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
  throw lastError ?? new Error("Request failed");
}

export function useAccountConnection(): AccountConnectionState {
  const queryClient = useQueryClient();
  const sessionQuery = useMastodonSession();
  const disconnectMutation = useDisconnectMastodon();

  const [instanceInput, setInstanceInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const connectedAccount = useMemo((): ConnectedAccountInfo | null => {
    const s = sessionQuery.data;
    if (!s?.connected || !s.account?.acct || !s.instanceOrigin) return null;
    return {
      instanceOrigin: s.instanceOrigin,
      acct: s.account.acct,
      displayName: s.account.display_name || undefined,
      avatar: s.account.avatar || undefined,
      profileUrl: s.account.url || undefined,
      grantedScopes: s.scope ? s.scope.split(" ").filter(Boolean) : undefined
    };
  }, [sessionQuery.data]);

  // Handle OAuth callback on mount
  useEffect(() => {
    let cancelled = false;

    const callbackUrl = new URL(window.location.href);
    const code = callbackUrl.searchParams.get("code");
    const returnedState = callbackUrl.searchParams.get("state");
    const oauthError = callbackUrl.searchParams.get("error");

    if (!code && !oauthError) return;

    const pending = loadPendingAuthTransaction();
    if (!pending) {
      if (!cancelled) {
        setError("Authentication callback was received, but no active login transaction was found.");
      }
      callbackUrl.searchParams.delete("code");
      callbackUrl.searchParams.delete("state");
      callbackUrl.searchParams.delete("error");
      window.history.replaceState({}, "", callbackUrl.toString());
      return () => { cancelled = true; };
    }

    if (oauthError) {
      if (!cancelled) {
        setError(`Authorization failed: ${oauthError}`);
      }
      clearPendingAuthTransaction();
      callbackUrl.searchParams.delete("code");
      callbackUrl.searchParams.delete("state");
      callbackUrl.searchParams.delete("error");
      window.history.replaceState({}, "", callbackUrl.toString());
      return () => { cancelled = true; };
    }

    if (!returnedState || returnedState !== pending.state) {
      if (!cancelled) {
        setError("State validation failed. Please retry login.");
      }
      clearPendingAuthTransaction();
      callbackUrl.searchParams.delete("code");
      callbackUrl.searchParams.delete("state");
      callbackUrl.searchParams.delete("error");
      window.history.replaceState({}, "", callbackUrl.toString());
      return () => { cancelled = true; };
    }

    if (!cancelled) {
      setIsWorking(true);
      setError(null);
      setInfo("Authorization callback validated. Exchanging code...");
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
        const response = await fetchWithRetry(exchangeEndpoint, {
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
          setInfo(`Account connected${accountText}. Token exchange completed.`);
          if (payload.account && payload.instanceOrigin) {
            void queryClient.invalidateQueries({ queryKey: mastodonActivityQueryKeys.session() });
          }
        }
        clearPendingAuthTransaction();
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsWorking(false);
        }
        // Always clear OAuth params if we're still on the callback URL,
        // even if the hook was unmounted (prevents stale code/state in
        // history that could be reprocessed on remount or leak via referrers).
        // Only delete specific OAuth params to preserve any other query params
        // that may have been added during the async exchange.
        if (window.location.pathname === callbackUrl.pathname) {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete("code");
          currentUrl.searchParams.delete("state");
          currentUrl.searchParams.delete("error");
          window.history.replaceState({}, "", currentUrl.toString());
        }
      }
    })();

    return () => { cancelled = true; };
  }, [queryClient]);

  const startLogin = useCallback(async (overrideInstance?: string) => {
    setError(null);
    setInfo(null);

    let normalizedInstance = "";
    try {
      normalizedInstance = normalizeInstanceOrigin(overrideInstance ?? instanceInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setIsWorking(true);
    try {
      const discovery = await discoverMastodonOAuth(normalizedInstance);
      const redirectUri = getOAuthRedirectUri();
      const registerEndpoint = import.meta.env.VITE_MASTODON_AUTH_REGISTER_ENDPOINT ?? DEFAULT_MASTODON_REGISTER_ENDPOINT;
      const registerPayload = parseMastodonRegisterRequest({
        instanceOrigin: discovery.instanceOrigin,
        redirectUris: [redirectUri],
        scopes: discovery.scopeDecision.requestedScopes
      });

      const registerResponse = await fetchWithRetry(registerEndpoint, {
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
        setInfo("This instance did not report S256 PKCE in metadata. Proceeding with standards-based parameters.");
      } else if (discovery.fallbackReason) {
        setInfo(`OAuth metadata fallback in use: ${discovery.fallbackReason}`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWorking(false);
    }
  }, [instanceInput]);

  const disconnect = useCallback(async () => {
    setIsWorking(true);
    setError(null);
    try {
      await disconnectMutation.mutateAsync();
      setInfo(null);
      setInstanceInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWorking(false);
    }
  }, [disconnectMutation]);

  const applyInstance = useCallback((domain: string) => {
    setInstanceInput(domain);
    setError(null);
    setInfo(null);
    setPickerOpen(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const retry = useCallback(() => {
    setError(null);
    setInfo(null);
    // Re-invoke login with a plausible instance. If instanceInput is empty
    // (e.g. after a failed OAuth callback exchange), try to recover the
    // instance from the pending transaction that was used for authorization.
    let target = instanceInput.trim();
    if (!target || !target.includes(".")) {
      const pending = loadPendingAuthTransaction();
      if (pending?.instanceOrigin) {
        target = pending.instanceOrigin.replace(/^https?:\/\//, "");
        setInstanceInput(target);
      }
    }
    if (target && target.includes(".")) {
      // Pass target explicitly to avoid stale closure — setInstanceInput
      // is async so instanceInput captured by startLogin may still be empty.
      void startLogin(target);
    }
  }, [instanceInput, startLogin]);

  return {
    instanceInput,
    setInstanceInput,
    isWorking,
    error,
    info,
    clearError,
    pickerOpen,
    openPicker: useCallback(() => setPickerOpen(true), []),
    closePicker: useCallback(() => setPickerOpen(false), []),
    startLogin,
    applyInstance,
    connectedAccount,
    isLoadingSession: sessionQuery.isPending,
    disconnect,
    isDisconnecting: disconnectMutation.isPending,
    retry
  };
}
