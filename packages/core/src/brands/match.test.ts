import { describe, expect, it } from "vitest";
import { matchBrand, resolveBrand } from "./match.ts";

describe("matchBrand", () => {
  it("matches a known merchant, case- and diacritic-folded", () => {
    expect(matchBrand("ORLEN")).toBe("orlen");
    expect(matchBrand("orlen")).toBe("orlen");
    expect(matchBrand("  Orlen  ")).toBe("orlen");
  });

  it("matches a multi-word alias", () => {
    expect(matchBrand("YouTube Premium")).toBe("youtube");
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
      brandSource: "catalog",
    });
  });

  it("both fields are null, never one alone, for an unmatched payee", () => {
    expect(resolveBrand("Corner Café", undefined)).toEqual({
      brandKey: null,
      brandSource: null,
    });
  });
});
