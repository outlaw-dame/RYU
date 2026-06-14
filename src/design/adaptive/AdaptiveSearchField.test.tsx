import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AdaptiveSearchField } from "./AdaptiveSearchField";

describe("AdaptiveSearchField", () => {
  afterEach(() => {
    cleanup();
  });

  it("sets standard virtual keyboard properties and search attributes", () => {
    const handleChange = vi.fn();
    render(<AdaptiveSearchField value="" onChange={handleChange} />);

    const input = screen.getByPlaceholderText("Search...");
    expect(input.getAttribute("type")).toBe("search");
    expect(input.getAttribute("inputmode")).toBe("search");
    expect(input.getAttribute("enterkeyhint")).toBe("search");
    expect(input.getAttribute("autocapitalize")).toBe("none");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  it("triggers onChange when user types", () => {
    const handleChange = vi.fn();
    render(<AdaptiveSearchField value="" onChange={handleChange} />);

    const input = screen.getByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "test query" } });
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders clear button when value is present and triggers onClear", () => {
    const handleClear = vi.fn();
    render(
      <AdaptiveSearchField value="something" onChange={() => {}} onClear={handleClear} />
    );

    const clearButton = screen.getByLabelText("Clear search");
    expect(clearButton).toBeTruthy();
    fireEvent.click(clearButton);
    expect(handleClear).toHaveBeenCalled();
  });

  it("correctly renders classNames and forwards additional HTML input properties", () => {
    const handleChange = vi.fn();
    render(
      <AdaptiveSearchField
        value="query"
        onChange={handleChange}
        className="custom-class"
        data-custom-attribute="test-value"
        aria-describedby="some-element"
      />
    );

    const container = screen.getByPlaceholderText("Search...").parentElement;
    expect(container?.className).toContain("adaptive-search-container");
    expect(container?.className).toContain("custom-class");

    const input = screen.getByPlaceholderText("Search...");
    expect(input.className).toContain("adaptive-search-input");
    expect(input.getAttribute("data-custom-attribute")).toBe("test-value");
    expect(input.getAttribute("aria-describedby")).toBe("some-element");
  });
});
