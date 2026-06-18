/* @vitest-environment jsdom */

import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryScreen } from "./LibraryScreen";
import type { HTMLAttributes } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "library.title": "Library",
        "library.searchPlaceholder": "Search your library...",
        "library.searchAriaLabel": "Search within library",
        "library.allBooks": "All Books",
        "library.wantToRead": "Want to Read",
        "library.reading": "Reading",
        "library.read": "Read",
        "library.didNotFinish": "Did Not Finish",
        "library.emptyTitle": "Your library is empty",
        "library.emptyDescription": "Import books from BookWyrm or add them from search.",
        "library.emptyFilterTitle": "No books in this shelf",
        "library.emptyFilterDescription": "Move books here by changing their reading status.",
        "readingStatus.label": "Reading status"
      };
      if (key === "library.bookCount") return `${opts?.count} books`;
      return map[key] ?? key;
    }
  })
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    )
  }
}));

const mockUseLibrary = vi.fn();
vi.mock("../../hooks/useLibrary", () => ({
  useLibrary: () => mockUseLibrary()
}));

beforeEach(() => {
  cleanup();
  mockUseLibrary.mockReturnValue({
    filteredBooks: [],
    loading: false,
    filter: "all",
    setFilter: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    library: { all: [], wantToRead: [], reading: [], read: [], didNotFinish: [] }
  });
});
afterEach(() => { cleanup(); });

describe("LibraryScreen", () => {
  it("renders the library title", () => {
    render(<LibraryScreen />);
    expect(screen.getByText("Library")).toBeDefined();
  });

  it("shows empty state when no books", () => {
    render(<LibraryScreen />);
    expect(screen.getByText("Your library is empty")).toBeDefined();
  });

  it("renders filter tabs", () => {
    render(<LibraryScreen />);
    expect(screen.getByRole("tab", { name: "All Books" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Want to Read" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Reading" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Read" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Did Not Finish" })).toBeDefined();
  });

  it("shows search input", () => {
    render(<LibraryScreen />);
    expect(screen.getByPlaceholderText("Search your library...")).toBeDefined();
  });

  it("shows books when available", () => {
    mockUseLibrary.mockReturnValue({
      filteredBooks: [{ id: "1", title: "Dune", author: "Frank Herbert" }],
      loading: false,
      filter: "all",
      setFilter: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      library: { all: [{ id: "1", title: "Dune", author: "Frank Herbert" }], wantToRead: [], reading: [], read: [], didNotFinish: [] }
    });
    render(<LibraryScreen />);
    expect(screen.getByText("Dune")).toBeDefined();
  });

  it("shows filter-specific empty state when books exist but none match filter", () => {
    mockUseLibrary.mockReturnValue({
      filteredBooks: [],
      loading: false,
      filter: "reading",
      setFilter: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      library: { all: [{ id: "1", title: "Dune" }], wantToRead: [], reading: [], read: [], didNotFinish: [] }
    });
    render(<LibraryScreen />);
    expect(screen.getByText("No books in this shelf")).toBeDefined();
  });
});
