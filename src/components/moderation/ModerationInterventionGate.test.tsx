import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { ModerationInterventionGate } from "./ModerationInterventionGate";

const baseDecision = {
  reasons: [] as string[],
  matchedFilters: [],
  safetyLabels: []
};

afterEach(async () => {
  await i18n.changeLanguage("en");
});

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

    fireEvent.click(screen.getByRole("button", { name: "Show anyway" }));
    expect(screen.getByText("Revealed content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide content" }));
    expect(screen.queryByText("Revealed content")).not.toBeInTheDocument();
  });

  it("requires a fresh reveal when the rendered content changes", () => {
    const decision = {
      ...baseDecision,
      action: "warn" as const,
      reasons: ["Filtered content"]
    };
    const { rerender } = render(
      <ModerationInterventionGate decision={decision}>
        <span>Original content</span>
      </ModerationInterventionGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "Show anyway" }));
    expect(screen.getByText("Original content")).toBeInTheDocument();

    rerender(
      <ModerationInterventionGate decision={decision}>
        <span>Edited content</span>
      </ModerationInterventionGate>
    );

    expect(screen.queryByText("Edited content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show anyway" })).toBeInTheDocument();
  });

  it("uses the active locale for moderation controls", async () => {
    await i18n.changeLanguage("es");
    render(
      <ModerationInterventionGate decision={{ ...baseDecision, action: "warn" }}>
        <span>Contenido</span>
      </ModerationInterventionGate>
    );

    expect(screen.getByRole("group", { name: "Advertencia de contenido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar de todos modos" })).toBeInTheDocument();
  });
});
