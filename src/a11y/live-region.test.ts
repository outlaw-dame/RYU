import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announce, clearLiveRegions } from "./live-region";

describe("live-region", () => {
  beforeEach(() => {
    clearLiveRegions();
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearLiveRegions();
    vi.useRealTimers();
  });

  it("creates a polite live region and announces a message", () => {
    announce("3 results found");

    const region = document.getElementById("ryu-live-region-polite");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("aria-atomic")).toBe("true");
    expect(region?.getAttribute("role")).toBe("status");

    // Message is set after requestAnimationFrame
    vi.advanceTimersByTime(16);
    expect(region?.textContent).toBe("3 results found");
  });

  it("creates an assertive live region with role=alert", () => {
    announce("Error occurred", "assertive");

    const region = document.getElementById("ryu-live-region-assertive");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-live")).toBe("assertive");
    expect(region?.getAttribute("role")).toBe("alert");

    vi.advanceTimersByTime(16);
    expect(region?.textContent).toBe("Error occurred");
  });

  it("clears the announcement after the specified delay", () => {
    announce("Temporary message", "polite", { clearDelay: 500 });

    const region = document.getElementById("ryu-live-region-polite");
    vi.advanceTimersByTime(16); // rAF
    expect(region?.textContent).toBe("Temporary message");

    vi.advanceTimersByTime(500);
    expect(region?.textContent).toBe("");
  });

  it("reuses existing region elements on subsequent calls", () => {
    announce("First message");
    announce("Second message");

    const regions = document.querySelectorAll("#ryu-live-region-polite");
    expect(regions.length).toBe(1);
  });

  it("visually hides the region element", () => {
    announce("Hidden message");

    const region = document.getElementById("ryu-live-region-polite");
    expect(region?.style.position).toBe("absolute");
    expect(region?.style.width).toBe("1px");
    expect(region?.style.height).toBe("1px");
    expect(region?.style.overflow).toBe("hidden");
  });

  it("clearLiveRegions removes all region elements from DOM", () => {
    announce("polite msg", "polite");
    announce("assertive msg", "assertive");

    expect(document.getElementById("ryu-live-region-polite")).not.toBeNull();
    expect(document.getElementById("ryu-live-region-assertive")).not.toBeNull();

    clearLiveRegions();

    expect(document.getElementById("ryu-live-region-polite")).toBeNull();
    expect(document.getElementById("ryu-live-region-assertive")).toBeNull();
  });

  it("handles repeated announcements by clearing and re-setting content", () => {
    announce("First");
    vi.advanceTimersByTime(16);

    const region = document.getElementById("ryu-live-region-polite");
    expect(region?.textContent).toBe("First");

    announce("Second");
    // Content is cleared synchronously, then set in rAF
    expect(region?.textContent).toBe("");
    vi.advanceTimersByTime(16);
    expect(region?.textContent).toBe("Second");
  });
});
