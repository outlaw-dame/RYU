/* @vitest-environment jsdom */

import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingStatusControl } from "./ReadingStatusControl";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "readingStatus.label": "Reading status",
        "readingStatus.wantToRead": "Want to Read",
        "readingStatus.reading": "Currently Reading",
        "readingStatus.read": "Read",
        "readingStatus.didNotFinish": "Did Not Finish"
      };
      return map[key] ?? key;
    }
  })
}));

vi.mock("../../design/icons/AppIcon", () => ({
  AppIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />
}));

beforeEach(() => { cleanup(); });
afterEach(() => { cleanup(); });

describe("ReadingStatusControl", () => {
  it("renders all status buttons", () => {
    render(<ReadingStatusControl onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Want to Read/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Currently Reading/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Read$/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Did Not Finish/ })).toBeDefined();
  });

  it("marks the active status with aria-pressed", () => {
    render(<ReadingStatusControl currentStatus="reading" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Currently Reading/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Want to Read/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with status when clicking an inactive button", () => {
    const onChange = vi.fn();
    render(<ReadingStatusControl onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Want to Read/ }));
    expect(onChange).toHaveBeenCalledWith("want-to-read");
  });

  it("calls onChange with undefined when clicking the active status (toggle off)", () => {
    const onChange = vi.fn();
    render(<ReadingStatusControl currentStatus="read" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Read$/ }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows check icon only on the active status", () => {
    render(<ReadingStatusControl currentStatus="want-to-read" onChange={vi.fn()} />);
    expect(screen.getByTestId("icon-check")).toBeDefined();
  });
});
