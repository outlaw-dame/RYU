/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommendationFeedbackMenu } from "./RecommendationFeedbackMenu";

const translations: Record<string, string> = {
  "discovery.feedback.tuneAria": "Ajustar esta recomendación",
  "discovery.feedback.tune": "Ajustar",
  "discovery.feedback.saving": "Guardando…",
  "discovery.feedback.menuLabel": "Preferencias de recomendaciones",
  "discovery.feedback.show_more": "Mostrar más como esto",
  "discovery.feedback.show_moreDescription": "Aumenta la influencia.",
  "discovery.feedback.show_less": "Mostrar menos como esto",
  "discovery.feedback.show_lessDescription": "Reduce la influencia.",
  "discovery.feedback.not_interested": "No me interesa",
  "discovery.feedback.not_interestedDescription": "Oculta esta recomendación.",
  "discovery.feedback.suppress": "No recomendar nunca",
  "discovery.feedback.suppressDescription": "Excluye esta entidad.",
  "discovery.feedback.neutral": "Restablecer preferencia",
  "discovery.feedback.neutralDescription": "Elimina la preferencia.",
  "discovery.feedback.saveError": "No se pudo guardar esta preferencia."
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key })
}));

afterEach(() => cleanup());

describe("RecommendationFeedbackMenu", () => {
  it("exposes every durable feedback action in the selected language", () => {
    render(<RecommendationFeedbackMenu onSelect={vi.fn()} />);

    fireEvent.click(screen.getByText("Ajustar"));

    expect(screen.getByRole("menuitem", { name: "Mostrar más como esto" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Mostrar menos como esto" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "No me interesa" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "No recomendar nunca" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Restablecer preferencia" })).toBeDefined();
    expect(screen.getByLabelText("Ajustar esta recomendación")).toBeDefined();
  });

  it("forwards the selected state without account scope", () => {
    const onSelect = vi.fn();
    render(<RecommendationFeedbackMenu onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Ajustar"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mostrar menos como esto" }));

    expect(onSelect).toHaveBeenCalledWith("show_less");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("disables actions and translates persistence errors", () => {
    render(
      <RecommendationFeedbackMenu
        pending
        error="discovery.feedback.saveError"
        onSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Guardando…"));

    expect(screen.getByRole("menuitem", { name: "Mostrar más como esto" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toContain("No se pudo guardar");
  });
});
