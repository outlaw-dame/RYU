import { describe, expect, it } from "vitest";
import {
  createActivityPubReviewerAttribution,
  getVerifiedReviewerAttribution
} from "./reviewer-attribution";

describe("verified reviewer attribution", () => {
  it("accepts a canonical HTTPS ActivityPub actor identity", () => {
    const result = createActivityPubReviewerAttribution(" https://books.example/users/alice ");

    expect(result).toEqual({
      accountId: "https://books.example/users/alice",
      source: "activitypub_attributed_to"
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    "",
    "alice",
    "http://books.example/users/alice",
    "https://alice:secret@books.example/users/alice",
    "https://books.example/users/alice#private"
  ])("rejects an unsafe or unverifiable identity: %s", (accountId) => {
    expect(() => createActivityPubReviewerAttribution(accountId)).toThrow(
      "Invalid reviewer account identity"
    );
  });

  it("returns attribution only when both the verified source and account ID are present", () => {
    expect(getVerifiedReviewerAttribution({
      reviewerAccountId: "https://books.example/users/alice",
      reviewerAttributionSource: "activitypub_attributed_to"
    })).toEqual({
      accountId: "https://books.example/users/alice",
      source: "activitypub_attributed_to"
    });

    expect(getVerifiedReviewerAttribution({
      reviewerAccountId: "https://books.example/users/alice"
    })).toBeNull();
    expect(getVerifiedReviewerAttribution({
      reviewerAttributionSource: "activitypub_attributed_to"
    })).toBeNull();
  });

  it("fails closed for malformed persisted attribution", () => {
    expect(getVerifiedReviewerAttribution({
      reviewerAccountId: "javascript:alert(1)",
      reviewerAttributionSource: "activitypub_attributed_to"
    })).toBeNull();
  });
});
