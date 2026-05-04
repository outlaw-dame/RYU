import { useCallback, useEffect, useState } from "react";
import type { MastodonList, MastodonPage, MastodonStatus } from "../sync/mastodon-client";
import { getShelves } from "../sync/mastodon-activity-api";

export type ShelvesError = "unauthenticated" | "network";

export type ShelvesState = {
  bookmarks: MastodonStatus[];
  favourites: MastodonStatus[];
  lists: MastodonList[];
  loading: boolean;
  error: ShelvesError | null;
};

export type ShelvesActions = {
  reload: () => void;
  addBookmark: (status: MastodonStatus) => void;
  removeBookmark: (id: string) => void;
  addFavourite: (status: MastodonStatus) => void;
  removeFavourite: (id: string) => void;
};

const INITIAL: ShelvesState = {
  bookmarks: [],
  favourites: [],
  lists: [],
  loading: false,
  error: null
};

async function loadShelves(): Promise<Pick<ShelvesState, "bookmarks" | "favourites" | "lists">> {
  try {
    const payload = await getShelves();
    const bPage = payload.bookmarks as MastodonPage<MastodonStatus>;
    const fPage = payload.favourites as MastodonPage<MastodonStatus>;
    const lists = payload.lists as MastodonList[];

    return {
      bookmarks: bPage.items,
      favourites: fPage.items,
      lists: Array.isArray(lists) ? lists : []
    };
  } catch (error) {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401 || status === 403) {
      throw new Error("unauthenticated");
    }

    throw new Error("network");
  }
}

export function useMastodonShelves(connected: boolean): ShelvesState & ShelvesActions {
  const [state, setState] = useState<ShelvesState>(INITIAL);
  const [epoch, setEpoch] = useState(0);

  const reload = useCallback(() => setEpoch((e) => e + 1), []);

  const addBookmark = useCallback((status: MastodonStatus) => {
    setState((prev) => {
      if (prev.bookmarks.some((b) => b.id === status.id)) return prev;
      return { ...prev, bookmarks: [status, ...prev.bookmarks] };
    });
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setState((prev) => ({ ...prev, bookmarks: prev.bookmarks.filter((b) => b.id !== id) }));
  }, []);

  const addFavourite = useCallback((status: MastodonStatus) => {
    setState((prev) => {
      if (prev.favourites.some((f) => f.id === status.id)) return prev;
      return { ...prev, favourites: [status, ...prev.favourites] };
    });
  }, []);

  const removeFavourite = useCallback((id: string) => {
    setState((prev) => ({ ...prev, favourites: prev.favourites.filter((f) => f.id !== id) }));
  }, []);

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

  return { ...state, reload, addBookmark, removeBookmark, addFavourite, removeFavourite };
}
