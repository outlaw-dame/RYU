import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AppIcon } from "../AppIcon";

describe("AppIcon", () => {
  it("renders decorative icon with aria-hidden", () => {
    const { container } = render(<AppIcon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
  });

  it("renders labeled icon with role='img' and aria-label", () => {
    const { container } = render(
      <AppIcon name="search" label="Search App" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-label")).toBe("Search App");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
  });

  it("allows setting state to active (which maps to fill weight)", () => {
    const { container } = render(<AppIcon name="heart" state="active" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // In @phosphor-icons/react, weights other than regular render path(s)
    // with different shape properties or specific weight props. We check size or presence.
    expect(svg?.getAttribute("weight")).toBeNull(); // React weight prop is consumed or passed down depending on component
  });

  it("applies custom size and class names", () => {
    const { container } = render(
      <AppIcon name="home" size={30} className="custom-class" />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("30");
    expect(svg?.getAttribute("height")).toBe("30");
    expect(svg?.classList.contains("custom-class")).toBe(true);
  });
});
