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
});
