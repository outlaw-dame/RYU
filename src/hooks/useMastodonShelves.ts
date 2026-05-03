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
