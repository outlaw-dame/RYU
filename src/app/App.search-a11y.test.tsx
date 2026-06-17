import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  MotionConfig: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, whileTap: _whileTap, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { whileTap?: unknown }) => (
      <button {...props}>{children}</button>
    ),
    section: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <section {...props}>{children}</section>
    )
  }
}));

vi.mock("../hooks/useDatabase", () => ({
  useDatabase: () => ({ state: "ready" })
}));

vi.mock("../hooks/useImportedBooks", () => ({
  useImportedBooks: () => ({ books: [], loading: false, reload: vi.fn().mockResolvedValue(undefined) })
}));

vi.mock("../hooks/useInstanceDiscovery", () => ({
  useInstanceDiscovery: () => ({
    instances: [],
    loading: false,
    error: null,
    refreshedAt: null,
    refresh: vi.fn().mockResolvedValue(undefined)
  })
}));

vi.mock("../hooks/useAutocomplete", () => ({
  useAutocomplete: (query: string) => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return [
      { id: "dune", title: "Dune" },
      { id: "dune-messiah", title: "Dune Messiah" },
      { id: "children-of-dune", title: "Children of Dune" }
    ];
  }
}));

vi.mock("../search/search", () => ({
  searchAll: vi.fn().mockResolvedValue({ all: [], editions: [], works: [], authors: [] })
}));

vi.mock("../sync/mastodon-activity-api", async () => {
  const actual = await vi.importActual<typeof import("../sync/mastodon-activity-api")>("../sync/mastodon-activity-api");
  return {
    ...actual,
    searchDiscoveryStatuses: vi.fn().mockResolvedValue({ items: [], links: {} })
  };
});

import { App } from "./App";
import { setSearchUiPreferences } from "../search/ui-preferences";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
}

function renderApp() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  setSearchUiPreferences({ manualFacetControls: false });
});

describe("Search autocomplete accessibility", () => {
  async function openSearchAndType(query: string) {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: "Search" }));
    const input = screen.getByLabelText("Search library");
    await user.type(input, query);
    return { user, input };
  }

  it("renders combobox/listbox semantics when suggestions are present", async () => {
    const { input } = await openSearchAndType("du");

    expect(input).toHaveAttribute("role", "combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", "search-autocomplete-list");

    const listbox = screen.getByRole("listbox", { name: "Search suggestions" });
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("supports Arrow navigation and Enter selection", async () => {
    const { input } = await openSearchAndType("du");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = screen.getByRole("option", { name: "Dune" });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", "search-autocomplete-option-dune");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = screen.getByRole("option", { name: "Dune Messiah" });
    expect(second).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Dune Messiah");
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("clears active option on Escape", async () => {
    const { input } = await openSearchAndType("du");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", "search-autocomplete-option-dune");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("separates existing-account sign in from create-account discovery", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("tab", { name: "Account" }));

    expect(screen.getByText("Use the server you already know, or pick one and come back when your account is ready.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with this server" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse servers" })).toBeInTheDocument();
  });

  it("hides manual facet chips by default", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: "Search" }));

    expect(screen.queryByRole("group", { name: "Search facets" })).not.toBeInTheDocument();
  });

  it("renders Books/Writing/Fediverse facet chips and toggles pressed state for power users", async () => {
    setSearchUiPreferences({ manualFacetControls: true });

    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: "Search" }));

    const booksChip = screen.getByRole("button", { name: "Books" });
    const writingChip = screen.getByRole("button", { name: "Writing" });
    const fediverseChip = screen.getByRole("button", { name: "Fediverse" });

    expect(booksChip).toHaveAttribute("aria-pressed", "true");
    expect(writingChip).toHaveAttribute("aria-pressed", "false");
    expect(fediverseChip).toHaveAttribute("aria-pressed", "false");

    await user.click(writingChip);
    expect(booksChip).toHaveAttribute("aria-pressed", "false");
    expect(writingChip).toHaveAttribute("aria-pressed", "true");

    await user.click(fediverseChip);
    expect(fediverseChip).toHaveAttribute("aria-pressed", "true");
  });
});
