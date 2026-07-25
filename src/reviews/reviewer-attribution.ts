export const REVIEWER_ATTRIBUTION_SOURCES = ["activitypub_attributed_to"] as const;

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

export function createActivityPubReviewerAttribution(
  accountId: string
): VerifiedReviewerAttribution {
  const normalized = normalizeReviewerAccountId(accountId);
  return Object.freeze({
    accountId: normalized,
    source: "activitypub_attributed_to"
  });
}

export function getVerifiedReviewerAttribution(
  review: ReviewerAttributedReview
): VerifiedReviewerAttribution | null {
  if (review.reviewerAttributionSource !== "activitypub_attributed_to") return null;
  if (!review.reviewerAccountId) return null;

  try {
    return createActivityPubReviewerAttribution(review.reviewerAccountId);
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
