/* @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { setReadingStatus, getReadingStatus } from "./useLibrary";

beforeEach(() => {
  window.localStorage.clear();
});

describe("reading status persistence", () => {
  it("stores and retrieves a reading status", () => {
    setReadingStatus("edition-1", "reading");
    expect(getReadingStatus("edition-1")).toBe("reading");
  });

  it("returns undefined for unknown editions", () => {
    expect(getReadingStatus("unknown")).toBeUndefined();
  });

  it("removes status when set to undefined", () => {
    setReadingStatus("edition-1", "read");
    setReadingStatus("edition-1", undefined);
    expect(getReadingStatus("edition-1")).toBeUndefined();
  });

  it("handles all status values", () => {
    setReadingStatus("e1", "want-to-read");
    setReadingStatus("e2", "reading");
    setReadingStatus("e3", "read");
    setReadingStatus("e4", "did-not-finish");
    expect(getReadingStatus("e1")).toBe("want-to-read");
    expect(getReadingStatus("e2")).toBe("reading");
    expect(getReadingStatus("e3")).toBe("read");
    expect(getReadingStatus("e4")).toBe("did-not-finish");
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem("ryu.reading-status.edition-1", "invalid");
    expect(getReadingStatus("edition-1")).toBeUndefined();
  });
});
