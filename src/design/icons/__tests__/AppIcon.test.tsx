/**
 * Tests for AppIcon component
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AppIcon } from "../AppIcon";

describe("AppIcon", () => {
  it("should render without crashing", () => {
    const { container } = render(<AppIcon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("should apply custom size", () => {
    const { container } = render(<AppIcon name="search" size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("should apply color prop", () => {
    const { container } = render(<AppIcon name="search" color="#ff0000" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("color")).toBe("#ff0000");
  });

  it("should apply className prop", () => {
    const { container } = render(<AppIcon name="search" className="custom-class" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("custom-class")).toBe(true);
  });

  it("should be aria-hidden by default", () => {
    const { container } = render(<AppIcon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("should not be aria-hidden when ariaLabel is provided", () => {
    const { container } = render(
      <AppIcon name="search" ariaLabel="Search" />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Search");
    expect(svg?.getAttribute("aria-hidden")).toBe("false");
  });

  it("should allow explicit ariaHidden override when ariaLabel is provided", () => {
    const { container } = render(
      <AppIcon name="search" ariaLabel="Search" ariaHidden={true} />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("should render different icons", () => {
    const { container: c1 } = render(<AppIcon name="book" />);
    const { container: c2 } = render(<AppIcon name="settings" />);
    // Both should render SVGs
    expect(c1.querySelector("svg")).toBeTruthy();
    expect(c2.querySelector("svg")).toBeTruthy();
  });

  it("should use default size of 24", () => {
    const { container } = render(<AppIcon name="home" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });
});
