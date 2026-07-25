/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommendationFeedbackMenu } from "./RecommendationFeedbackMenu";

afterEach(() => cleanup());

describe("RecommendationFeedbackMenu", () => {
  it("exposes every durable feedback action", () => {
    render(<RecommendationFeedbackMenu onSelect={vi.fn()} />);

    fireEvent.click(screen.getByText("Tune"));

    expect(screen.getByRole("menuitem", { name: "Show more like this" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Show less like this" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Not interested" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Never recommend this" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Reset preference" })).toBeDefined();
  });

  it("forwards the selected state without account scope", () => {
    const onSelect = vi.fn();
    render(<RecommendationFeedbackMenu onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Tune"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show less like this" }));

    expect(onSelect).toHaveBeenCalledWith("show_less");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("disables actions and reports persistence errors", () => {
    render(
      <RecommendationFeedbackMenu
        pending
        error="Could not save this preference. Try again."
        onSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Saving…"));

    expect(screen.getByRole("menuitem", { name: "Show more like this" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toContain("Could not save");
  });
});
