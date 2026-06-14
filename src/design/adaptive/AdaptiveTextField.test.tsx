import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AdaptiveTextField } from "./AdaptiveTextField";

describe("AdaptiveTextField", () => {
  afterEach(() => {
    cleanup();
  });

  it("defaults to sentence capitalization and spellcheck for general text", () => {
    render(<AdaptiveTextField placeholder="Enter description" />);
    const input = screen.getByPlaceholderText("Enter description");

    expect(input.getAttribute("autocapitalize")).toBe("sentences");
    expect(input.getAttribute("autocorrect")).toBe("on");
    expect(input.getAttribute("spellcheck")).toBe("true");
    expect(input.getAttribute("enterkeyhint")).toBe("done");
  });

  it("disables autocorrect and capitalization for domains or handles", () => {
    render(
      <AdaptiveTextField placeholder="username@instance.social" isDomainOrHandle={true} />
    );
    const input = screen.getByPlaceholderText("username@instance.social");

    expect(input.getAttribute("autocapitalize")).toBe("none");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  it("renders a textarea when the textarea prop is true", () => {
    render(<AdaptiveTextField placeholder="Long post content" textarea={true} />);
    const textarea = screen.getByPlaceholderText("Long post content");

    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("links label with input/textarea using htmlFor and id, and forwards custom props", () => {
    render(
      <AdaptiveTextField
        label="Username"
        placeholder="Enter username"
        id="custom-id-override"
        data-custom-prop="hello"
      />
    );
    const label = screen.getByText("Username");
    const input = screen.getByPlaceholderText("Enter username");

    expect(label.getAttribute("for")).toBe("custom-id-override");
    expect(input.getAttribute("id")).toBe("custom-id-override");
    expect(input.getAttribute("data-custom-prop")).toBe("hello");

    const container = label.parentElement;
    expect(container?.className).toContain("adaptive-field-container");
    expect(label.className).toContain("adaptive-field-label");
    expect(input.className).toContain("adaptive-input");
  });
});
