/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import type { HTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { CoverGrid } from "./CoverGrid";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    )
  }
}));

describe("CoverGrid", () => {
  it("keeps remote covers same-origin and linkifies book and author text", () => {
    render(
      <CoverGrid
        books={[
          {
            id: "dune",
            title: "Dune",
            author: "Frank Herbert",
            coverUrl: "https://covers.openlibrary.org/b/isbn/9780441013593-M.jpg",
            sourceUrl: "https://bookwyrm.social/book/123",
            authorUrl: "https://bookwyrm.social/author/456"
          }
        ]}
      />
    );

    expect(screen.getByRole("link", { name: "Open Dune" })).toHaveAttribute(
      "href",
      "https://bookwyrm.social/book/123"
    );
    expect(screen.getByRole("link", { name: "Dune" })).toHaveAttribute(
      "href",
      "https://bookwyrm.social/book/123"
    );
    expect(screen.getByRole("link", { name: "Frank Herbert" })).toHaveAttribute(
      "href",
      "https://bookwyrm.social/author/456"
    );
    expect(screen.getByRole("img", { name: "Cover of Dune" })).toHaveAttribute(
      "src",
      "/api/media/cover?url=https%3A%2F%2Fcovers.openlibrary.org%2Fb%2Fisbn%2F9780441013593-M.jpg"
    );
  });
});
