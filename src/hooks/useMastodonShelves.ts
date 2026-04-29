import { useCallback, useEffect, useState } from "react";
import type { MastodonList, MastodonPage, MastodonStatus } from "../sync/mastodon-client";

const ENDPOINT_BOOKMARKS = "/api/auth/mastodon/bookmarks?limit=20";
const ENDPOINT_FAVOURITES = "/api/auth/mastodon/favourites?limit=20";
const ENDPOINT_LISTS = "/api/auth/mastodon/lists";

export type ShelvesError = "unauthenticated" | "network";

export type ShelvesState = {
  bookmarks: MastodonStatus[];
  favourites: MastodonStatus[];
  lists: MastodonList[];
  loading: boolean;
  error: ShelvesError | null;
};

const INITIAL: ShelvesState = {
  bookmarks: [],
  favourites: [],
  lists: [],
  loading: false,
  error: null
};

async function loadShelves(): Promise<Pick<ShelvesState, "bookmarks" | "favourites" | "lists">> {
  const [bRes, fRes, lRes] = await Promise.all([
    fetch(ENDPOINT_BOOKMARKS, { credentials: "same-origin" }),
    fetch(ENDPOINT_FAVOURITES, { credentials: "same-origin" }),
    fetch(ENDPOINT_LISTS, { credentials: "same-origin" })
  ]);

  // 401/403 means the session expired or was revoked server-side.
  if (bRes.status === 401 || bRes.status === 403 ||
      fRes.status === 401 || fRes.status === 403 ||
      lRes.status === 401 || lRes.status === 403) {
    throw new Error("unauthenticated");
  }

  if (!bRes.ok || !fRes.ok || !lRes.ok) {
    throw new Error("network");
  }

  const [bPage, fPage, lists] = await Promise.all([
    bRes.json() as Promise<MastodonPage<MastodonStatus>>,
    fRes.json() as Promise<MastodonPage<MastodonStatus>>,
    lRes.json() as Promise<MastodonList[]>
  ]);

  return {
    bookmarks: bPage.items,
    favourites: fPage.items,
    lists: Array.isArray(lists) ? lists : []
  };
}

export function useMastodonShelves(connected: boolean): ShelvesState & { reload: () => void } {
  const [state, setState] = useState<ShelvesState>(INITIAL);
  const [epoch, setEpoch] = useState(0);

  const reload = useCallback(() => setEpoch((e) => e + 1), []);

  useEffect(() => {
    if (!connected) {
      setState(INITIAL);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    void loadShelves()
      .then((data) => {
        if (!cancelled) setState({ ...data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) {
          const error: ShelvesError = err.message === "unauthenticated" ? "unauthenticated" : "network";
          setState((prev) => ({ ...prev, loading: false, error }));
        }
      });

    return () => { cancelled = true; };
  }, [connected, epoch]);

  return { ...state, reload };
}
