import { describe, expect, it } from "vitest";
import { fold } from "../capture/names.ts";
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

  /** Internal whitespace is collapsed before the fold, so a doubled space does not defeat an otherwise exact match. */
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

  /**
   * `fold` maps only the Polish set, so a non-Polish accent like French "é"
   * survives it. Asserted on `fold`'s *own output*, not only on `matchBrand`
   * missing: neither "café" nor "cafe" is a catalogue alias, so a matcher
   * that did strip the accent would return `undefined` here too and the test
   * would pass while the documented limit had silently moved.
   */
  it("does not strip a non-Polish diacritic — a named limit, not a bug", () => {
    expect(fold("Café")).toBe("café");
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

/** Every transition `update_transaction` can produce. */
describe("resolveBrandPatch", () => {
  const NEVER_MATCHED: CurrentBrand = { brandKey: null, brandSource: null };
  const AUTO: CurrentBrand = { brandKey: "orlen", brandSource: "auto" };
  const MANUAL: CurrentBrand = { brandKey: "youtube", brandSource: "manual" };
  const NONE: CurrentBrand = { brandKey: null, brandSource: "none" };

  it("an explicit brandKey always wins, sourced manual", () => {
    for (const current of [NEVER_MATCHED, AUTO, MANUAL, NONE]) {
      expect(resolveBrandPatch(current, "anything", "youtube")).toEqual({
        brandKey: "youtube",
        brandSource: "manual",
      });
    }
  });

  it("an explicit null clears to a sticky 'none', regardless of the payee", () => {
    for (const current of [NEVER_MATCHED, AUTO, MANUAL, NONE]) {
      expect(resolveBrandPatch(current, "ORLEN", null)).toEqual({
        brandKey: null,
        brandSource: "none",
      });
    }
  });

  it("re-matches a changed payee when the current source is null (never matched)", () => {
    expect(resolveBrandPatch(NEVER_MATCHED, "ORLEN", undefined)).toEqual({
      brandKey: "orlen",
      brandSource: "auto",
    });
  });

  it("re-matches a changed payee when the current source is 'auto'", () => {
    expect(resolveBrandPatch(AUTO, "YouTube", undefined)).toEqual({
      brandKey: "youtube",
      brandSource: "auto",
    });
  });

  it("re-matching to nothing clears both fields to null, not 'none'", () => {
    expect(resolveBrandPatch(AUTO, "Corner Café", undefined)).toEqual({
      brandKey: null,
      brandSource: null,
    });
  });

  it("never re-matches when the current source is 'manual' — sticky", () => {
    expect(resolveBrandPatch(MANUAL, "ORLEN", undefined)).toBeUndefined();
  });

  it("never re-matches when the current source is 'none' — sticky", () => {
    expect(resolveBrandPatch(NONE, "ORLEN", undefined)).toBeUndefined();
  });

  /**
   * `{ brandKey: undefined }` is "this patch has no opinion", never a clear —
   * a caller spreading an optional field builds exactly that object, and
   * reading it as an assertion would write `manual`/`undefined` into a column
   * pair the CHECK exists to keep honest.
   */
  it("an undefined brandKey is no assertion at all — the payee decides", () => {
    expect(resolveBrandPatch(NEVER_MATCHED, "ORLEN", undefined)).toEqual({
      brandKey: "orlen",
      brandSource: "auto",
    });
    expect(resolveBrandPatch(MANUAL, "ORLEN", undefined)).toBeUndefined();
  });
});
