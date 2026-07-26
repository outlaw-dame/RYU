import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModerationInterventionGate } from "./ModerationInterventionGate";

const baseDecision = {
  reasons: [] as string[],
  matchedFilters: [],
  safetyLabels: []
};

describe("ModerationInterventionGate", () => {
  it("renders show decisions without an extra prompt", () => {
    render(
      <ModerationInterventionGate decision={{ ...baseDecision, action: "show" }}>
        <span>Visible content</span>
      </ModerationInterventionGate>
    );

    expect(screen.getByText("Visible content")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("never renders hard-hidden content", () => {
    render(
      <ModerationInterventionGate decision={{ ...baseDecision, action: "hide" }}>
        <span>Secret content</span>
      </ModerationInterventionGate>
    );

    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("requires an explicit reveal and preserves the collapse summary", () => {
    render(
      <ModerationInterventionGate decision={{
        ...baseDecision,
        action: "collapse",
        collapseSummary: "Spoiler warning"
      }}>
        <span>Revealed content</span>
      </ModerationInterventionGate>
    );

    expect(screen.getByText("Spoiler warning")).toBeInTheDocument();
    expect(screen.queryByText("Revealed content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show content" }));
    expect(screen.getByText("Revealed content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide again" }));
    expect(screen.queryByText("Revealed content")).not.toBeInTheDocument();
  });
});
