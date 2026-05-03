import type { MastodonList, MastodonPage, MastodonStatus } from "./mastodon-client";

export type UnifiedShelfSource = "mastodon" | "bookwyrm_api" | "bookwyrm_html" | "bookwyrm_activitypub";

export type UnifiedShelf = {
  id: string;
  title: string;
  source: UnifiedShelfSource;
  itemCount?: number;
  url?: string;
};

export type UnifiedShelvesPayload = {
  bookmarks: MastodonPage<MastodonStatus>;
  favourites: MastodonPage<MastodonStatus>;
  lists: MastodonList[];
  unified: UnifiedShelf[];
  sources: {
    mastodon: boolean;
    bookwyrm: boolean;
  };
};
