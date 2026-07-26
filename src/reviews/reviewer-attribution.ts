export const REVIEWER_ATTRIBUTION_SOURCES = ["authenticated_activitypub_actor"] as const;

export type ReviewerAttributionSource = (typeof REVIEWER_ATTRIBUTION_SOURCES)[number];

export type VerifiedReviewerAttribution = Readonly<{
  accountId: string;
  source: ReviewerAttributionSource;
}>;

export type ReviewerAttributedReview = Readonly<{
  reviewerAccountId?: string;
  reviewerAttributionSource?: ReviewerAttributionSource;
}>;

const MAX_REVIEWER_ACCOUNT_ID_LENGTH = 2048;

export function createAuthenticatedActivityPubReviewerAttribution(
  claimedAccountId: string,
  authenticatedAccountId: string
): VerifiedReviewerAttribution {
  const claimed = normalizeReviewerAccountId(claimedAccountId);
  const authenticated = normalizeReviewerAccountId(authenticatedAccountId);
  if (claimed !== authenticated) {
    throw new Error("Authenticated reviewer identity does not match attributed actor");
  }

  return Object.freeze({
    accountId: authenticated,
    source: "authenticated_activitypub_actor"
  });
}

export function getVerifiedReviewerAttribution(
  review: ReviewerAttributedReview
): VerifiedReviewerAttribution | null {
  if (review.reviewerAttributionSource !== "authenticated_activitypub_actor") return null;
  if (!review.reviewerAccountId) return null;

  try {
    const accountId = normalizeReviewerAccountId(review.reviewerAccountId);
    return Object.freeze({
      accountId,
      source: "authenticated_activitypub_actor"
    });
  } catch {
    return null;
  }
}

function normalizeReviewerAccountId(input: string): string {
  const value = input.trim();
  if (!value || value.length > MAX_REVIEWER_ACCOUNT_ID_LENGTH) {
    throw new Error("Invalid reviewer account identity");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid reviewer account identity");
  }

  if (url.protocol !== "https:") {
    throw new Error("Invalid reviewer account identity");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("Invalid reviewer account identity");
  }

  return url.toString();
}
