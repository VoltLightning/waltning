import { describe, expect, it } from "vitest";
import { type CurrentBrand, matchBrand, resolveBrand, resolveBrandPatch } from "./match.ts";

describe("matchBrand", () => {
  it("matches a known merchant, case-folded", () => {
    expect(matchBrand("ORLEN")).toBe("orlen");
    expect(matchBrand("orlen")).toBe("orlen");
    expect(matchBrand("  Orlen  ")).toBe("orlen");
  });

  it("matches a multi-word alias", () => {
    expect(matchBrand("YouTube Premium")).toBe("youtube");
  });

  /** Round 1's L6 — internal whitespace is collapsed before the fold, so a doubled space does not defeat an otherwise exact match. */
  it("collapses internal whitespace before matching", () => {
    expect(matchBrand("YouTube  Premium")).toBe("youtube");
    expect(matchBrand("YouTube   Premium")).toBe("youtube");
  });

  it("does not match a substring — the whole payee must equal an alias", () => {
    // "ORLEN Stacja 123" carries the transaction id a receipt prints; this
    // module's exact-match index does not (yet) reach inside it — see the
    // file header on why that is a deliberate, named gap rather than a bug.
    expect(matchBrand("ORLEN Stacja 123")).toBeUndefined();
  });

  it("returns undefined for an unrecognised payee, including blank", () => {
    expect(matchBrand("Corner Café")).toBeUndefined();
    expect(matchBrand("")).toBeUndefined();
    expect(matchBrand("   ")).toBeUndefined();
  });

  /** Round 1's L6 — `fold` only maps Polish diacritics, so a non-Polish accent like French "é" survives it. Named here so the limit is a test, not a surprise. */
  it("does not strip a non-Polish diacritic — a named limit, not a bug", () => {
    expect(matchBrand("Café")).toBeUndefined();
  });
});

describe("resolveBrand", () => {
  it("an asserted key wins over the payee, and is sourced manual", () => {
    expect(resolveBrand("Corner Café", "youtube")).toEqual({
      brandKey: "youtube",
      brandSource: "manual",
    });
  });

  it("falls back to matching the payee when nothing was asserted", () => {
    expect(resolveBrand("ORLEN", undefined)).toEqual({
      brandKey: "orlen",
      brandSource: "auto",
    });
  });

  it("both fields are null, never one alone, for an unmatched payee", () => {
    expect(resolveBrand("Corner Café", undefined)).toEqual({
      brandKey: null,
      brandSource: null,
    });
  });
});

/** Round 1's M4 — every transition `update_transaction` can produce. */
describe("resolveBrandPatch", () => {
  const NEVER_MATCHED: CurrentBrand = { brandKey: null, brandSource: null };
  const AUTO: CurrentBrand = { brandKey: "orlen", brandSource: "auto" };
  const MANUAL: CurrentBrand = { brandKey: "youtube", brandSource: "manual" };
  const NONE: CurrentBrand = { brandKey: null, brandSource: "none" };

  it("an explicit brandKey always wins, sourced manual", () => {
    for (const current of [NEVER_MATCHED, AUTO, MANUAL, NONE]) {
      expect(resolveBrandPatch(current, "anything", true, "youtube")).toEqual({
        brandKey: "youtube",
        brandSource: "manual",
      });
    }
  });

  it("an explicit null clears to a sticky 'none', regardless of the payee", () => {
    for (const current of [NEVER_MATCHED, AUTO, MANUAL, NONE]) {
      expect(resolveBrandPatch(current, "ORLEN", true, null)).toEqual({
        brandKey: null,
        brandSource: "none",
      });
    }
  });

  it("re-matches a changed payee when the current source is null (never matched)", () => {
    expect(resolveBrandPatch(NEVER_MATCHED, "ORLEN", false, undefined)).toEqual({
      brandKey: "orlen",
      brandSource: "auto",
    });
  });

  it("re-matches a changed payee when the current source is 'auto'", () => {
    expect(resolveBrandPatch(AUTO, "YouTube", false, undefined)).toEqual({
      brandKey: "youtube",
      brandSource: "auto",
    });
  });

  it("re-matching to nothing clears both fields to null, not 'none'", () => {
    expect(resolveBrandPatch(AUTO, "Corner Café", false, undefined)).toEqual({
      brandKey: null,
      brandSource: null,
    });
  });

  it("never re-matches when the current source is 'manual' — sticky", () => {
    expect(resolveBrandPatch(MANUAL, "ORLEN", false, undefined)).toBeUndefined();
  });

  it("never re-matches when the current source is 'none' — sticky", () => {
    expect(resolveBrandPatch(NONE, "ORLEN", false, undefined)).toBeUndefined();
  });
});
