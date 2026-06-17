import { describe, expect, it } from "vitest";
import {
  containsCJK,
  detectQueryScript,
  foldDiacritics,
  isRTLText,
  normalizeForI18nSearch
} from "../queryNormalization";

describe("foldDiacritics", () => {
  it("removes accents from Latin characters", () => {
    expect(foldDiacritics("García")).toBe("Garcia");
    expect(foldDiacritics("naïve")).toBe("naive");
    expect(foldDiacritics("Ångström")).toBe("Angstrom");
    expect(foldDiacritics("café")).toBe("cafe");
    expect(foldDiacritics("résumé")).toBe("resume");
  });

  it("handles combined characters (precomposed vs decomposed)", () => {
    // U+00E9 (é precomposed) and U+0065 U+0301 (e + combining accent)
    expect(foldDiacritics("\u00e9")).toBe("e");
    expect(foldDiacritics("e\u0301")).toBe("e");
  });

  it("preserves non-Latin characters without combining marks", () => {
    expect(foldDiacritics("東京")).toBe("東京");
    expect(foldDiacritics("مرحبا")).toBe("مرحبا");
  });

  it("handles empty string", () => {
    expect(foldDiacritics("")).toBe("");
  });
});

describe("containsCJK", () => {
  it("detects Chinese characters", () => {
    expect(containsCJK("三体")).toBe(true);
    expect(containsCJK("The Three-Body Problem 三体")).toBe(true);
  });

  it("detects Japanese (Hiragana/Katakana/Kanji)", () => {
    expect(containsCJK("村上春樹")).toBe(true);
    expect(containsCJK("ノルウェイの森")).toBe(true);
  });

  it("detects Korean (Hangul)", () => {
    expect(containsCJK("채식주의자")).toBe(true);
  });

  it("returns false for Latin-only text", () => {
    expect(containsCJK("Dune by Frank Herbert")).toBe(false);
    expect(containsCJK("García Márquez")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsCJK("")).toBe(false);
  });
});

describe("isRTLText", () => {
  it("detects Arabic text", () => {
    expect(isRTLText("كتاب")).toBe(true);
  });

  it("detects Hebrew text", () => {
    expect(isRTLText("ספר")).toBe(true);
  });

  it("returns false for Latin text", () => {
    expect(isRTLText("Dune")).toBe(false);
  });

  it("returns false for CJK text", () => {
    expect(isRTLText("三体")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isRTLText("")).toBe(false);
  });

  it("detects RTL mark prefix", () => {
    expect(isRTLText("\u200Fhello")).toBe(true);
  });
});

describe("normalizeForI18nSearch", () => {
  it("trims, folds diacritics, and lowercases", () => {
    expect(normalizeForI18nSearch("  García Márquez  ")).toBe("garcia marquez");
    expect(normalizeForI18nSearch("DUNE")).toBe("dune");
    expect(normalizeForI18nSearch("Ångström")).toBe("angstrom");
  });

  it("preserves CJK characters (no case folding needed)", () => {
    expect(normalizeForI18nSearch("三体")).toBe("三体");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeForI18nSearch("   ")).toBe("");
  });
});

describe("detectQueryScript", () => {
  it("returns 'latin' for English/European text", () => {
    expect(detectQueryScript("Dune")).toBe("latin");
    expect(detectQueryScript("García")).toBe("latin");
  });

  it("returns 'cjk' for Chinese/Japanese/Korean", () => {
    expect(detectQueryScript("三体")).toBe("cjk");
    expect(detectQueryScript("채식주의자")).toBe("cjk");
  });

  it("returns 'rtl' for Arabic/Hebrew", () => {
    expect(detectQueryScript("كتاب")).toBe("rtl");
    expect(detectQueryScript("ספר")).toBe("rtl");
  });

  it("returns 'mixed' for combined CJK + RTL", () => {
    expect(detectQueryScript("三体 كتاب")).toBe("mixed");
  });
});
