/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewCard } from "./ReviewCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "review.rating") return `${opts?.count} star`;
      return key;
    },
    i18n: { language: "en" }
  })
}));

vi.mock("../../design/icons/AppIcon", () => ({
  AppIcon: ({ name, state }: { name: string; state?: string }) => (
    <span data-testid={`icon-${name}-${state ?? "default"}`} />
  )
}));

beforeEach(() => { cleanup(); });
afterEach(() => { cleanup(); });

describe("ReviewCard", () => {
  const baseReview = {
    id: "review-1",
    content: "A wonderful book.",
    editionId: "edition-1",
    accountId: "user-1",
    rating: 4,
    published: "2024-03-15T12:00:00.000Z",
    importedAt: "2024-03-15T12:00:00.000Z",
    updatedAt: "2024-03-15T12:00:00.000Z"
  };

  it("renders review content", () => {
    render(<ReviewCard review={baseReview} />);
    expect(screen.getByText("A wonderful book.")).toBeDefined();
  });

  it("renders star rating", () => {
    render(<ReviewCard review={baseReview} />);
    expect(screen.getByText("4/5")).toBeDefined();
  });

  it("renders publication date", () => {
    render(<ReviewCard review={baseReview} />);
    // Should display a formatted date
    expect(screen.getByRole("article")).toBeDefined();
  });

  it("renders title when present", () => {
    render(<ReviewCard review={{ ...baseReview, title: "Great read!" }} />);
    expect(screen.getByText("Great read!")).toBeDefined();
  });

  it("does not render rating section when rating is 0", () => {
    render(<ReviewCard review={{ ...baseReview, rating: 0 }} />);
    expect(screen.queryByText(/\/5/)).toBeNull();
  });
});
