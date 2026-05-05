/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverGrid } from "./CoverGrid";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    )
  }
}));

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

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

  it("falls back to Google Books cover when OpenLibrary cover fails", () => {
    render(
      <CoverGrid
        books={[
          {
            id: "dune",
            title: "Dune",
            author: "Frank Herbert",
            coverUrl: "https://covers.openlibrary.org/b/isbn/9780441013593-M.jpg"
          }
        ]}
      />
    );

    const [img] = screen.getAllByRole("img", { name: "Cover of Dune" });
    img.dispatchEvent(new Event("error"));

    expect(img).toHaveAttribute(
      "src",
      "/api/media/cover?url=https%3A%2F%2Fbooks.google.com%2Fbooks%2Fcontent%3Fvid%3DISBN9780441013593%26printsec%3Dfrontcover%26img%3D1%26zoom%3D1%26source%3Dgbs_api"
    );
  });
});
