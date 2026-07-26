import { describe, expect, it } from "vitest";
import {
  createAuthenticatedActivityPubReviewerAttribution,
  getVerifiedReviewerAttribution
} from "./reviewer-attribution";

describe("verified reviewer attribution", () => {
  it("accepts matching claimed and authenticated ActivityPub actor identities", () => {
    const result = createAuthenticatedActivityPubReviewerAttribution(
      " https://books.example/users/alice ",
      "https://books.example/users/alice"
    );

    expect(result).toEqual({
      accountId: "https://books.example/users/alice",
      source: "authenticated_activitypub_actor"
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects an authenticated actor that does not match attributedTo", () => {
    expect(() => createAuthenticatedActivityPubReviewerAttribution(
      "https://books.example/users/alice",
      "https://books.example/users/mallory"
    )).toThrow("Authenticated reviewer identity does not match attributed actor");
  });

  it.each([
    "",
    "alice",
    "http://books.example/users/alice",
    "https://alice:secret@books.example/users/alice",
    "https://books.example/users/alice#private"
  ])("rejects an unsafe identity: %s", (accountId) => {
    expect(() => createAuthenticatedActivityPubReviewerAttribution(accountId, accountId)).toThrow(
      "Invalid reviewer account identity"
    );
  });

  it("returns attribution only when both the authenticated source and account ID are present", () => {
    expect(getVerifiedReviewerAttribution({
      reviewerAccountId: "https://books.example/users/alice",
      reviewerAttributionSource: "authenticated_activitypub_actor"
    })).toEqual({
      accountId: "https://books.example/users/alice",
      source: "authenticated_activitypub_actor"
    });

    expect(getVerifiedReviewerAttribution({
      reviewerAccountId: "https://books.example/users/alice"
    })).toBeNull();
    expect(getVerifiedReviewerAttribution({
      reviewerAttributionSource: "authenticated_activitypub_actor"
    })).toBeNull();
  });

  it("fails closed for malformed persisted attribution", () => {
    expect(getVerifiedReviewerAttribution({
      reviewerAccountId: "javascript:alert(1)",
      reviewerAttributionSource: "authenticated_activitypub_actor"
    })).toBeNull();
  });
});
