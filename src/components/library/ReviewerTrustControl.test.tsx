/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewDoc } from "../../db/schema";
import { ReviewerTrustControl } from "./ReviewerTrustControl";

const setState = vi.fn();
const load = vi.fn();
const dispose = vi.fn();
let listener: ((snapshot: any) => void) | null = null;

vi.mock("../../sync/use-mastodon-activity", () => ({
  useMastodonSession: () => ({
    data: {
      connected: true,
      instanceOrigin: "https://books.example",
      account: { id: "owner-1" }
    }
  })
}));

vi.mock("../../recommendations", () => ({
  buildUserSignalScopeFromSession: () => ({
    ownerAccountId: "owner-1",
    instanceOrigin: "https://books.example"
  }),
  listReviewerTrustOptions: () => [
    { state: "trusted", label: "Prioritize reviews", description: "Trusted", destructive: false },
    { state: "neutral", label: "Use normally", description: "Neutral", destructive: false },
    { state: "low_trust", label: "Show less influence", description: "Low", destructive: false },
    { state: "muted", label: "Hide reviewed recommendations", description: "Muted", destructive: true },
    { state: "blocked", label: "Block reviewed recommendations", description: "Blocked", destructive: true }
  ],
  createReviewerTrustManager: () => ({
    subscribe: (next: (snapshot: any) => void) => {
      listener = next;
      next({
        reviewerAccountId: "https://books.example/users/alice",
        state: "neutral",
        persistedState: "neutral",
        status: "ready",
        error: null,
        revision: 1
      });
      return () => { listener = null; };
    },
    load,
    setState,
    retry: vi.fn(),
    getSnapshot: vi.fn(),
    dispose
  })
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const values: Record<string, string> = {
        "reviewTrust.menuAria": "Change reviewer influence",
        "reviewTrust.menuLabel": "Reviewer recommendation influence",
        "reviewTrust.current": `Reviewer: ${params?.state ?? ""}`,
        "reviewTrust.saving": "Saving…",
        "reviewTrust.saveError": "Could not save",
        "reviewTrust.states.trusted": "Prioritize reviews",
        "reviewTrust.states.neutral": "Use normally",
        "reviewTrust.states.low_trust": "Show less influence",
        "reviewTrust.states.muted": "Hide reviewed recommendations",
        "reviewTrust.states.blocked": "Block reviewed recommendations"
      };
      return values[key] ?? key;
    }
  })
}));

const baseReview: ReviewDoc = {
  id: "review-1",
  content: "Excellent.",
  editionId: "edition-1",
  accountId: "https://books.example/users/alice",
  published: "2026-07-25T00:00:00.000Z",
  importedAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z"
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  listener = null;
  load.mockResolvedValue(undefined);
  setState.mockResolvedValue(undefined);
});

describe("ReviewerTrustControl", () => {
  it("renders nothing for an unverified review", () => {
    const { container } = render(<ReviewerTrustControl review={baseReview} />);
    expect(container).toBeEmptyDOMElement();
    expect(load).not.toHaveBeenCalled();
  });

  it("loads and changes trust only for authenticated verified attribution", async () => {
    render(
      <ReviewerTrustControl
        review={{
          ...baseReview,
          reviewerAccountId: "https://books.example/users/alice",
          reviewerAttributionSource: "authenticated_activitypub_actor"
        }}
      />
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText("Change reviewer influence"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Prioritize reviews" }));

    expect(setState).toHaveBeenCalledWith("trusted");
  });

  it("shows a generic error and never exposes reviewer IDs", async () => {
    render(
      <ReviewerTrustControl
        review={{
          ...baseReview,
          reviewerAccountId: "https://books.example/users/alice",
          reviewerAttributionSource: "authenticated_activitypub_actor"
        }}
      />
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    listener?.({
      reviewerAccountId: "https://books.example/users/alice",
      state: "neutral",
      persistedState: "neutral",
      status: "error",
      error: new Error("private database details"),
      revision: 2
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Could not save");
    expect(document.body.textContent).not.toContain("https://books.example/users/alice");
    expect(document.body.textContent).not.toContain("private database details");
  });
});
