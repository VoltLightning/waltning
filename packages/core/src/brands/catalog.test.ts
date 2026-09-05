import { describe, expect, it } from "vitest";
import { fold } from "../capture/names.ts";
import { BRAND_CATALOG, brandCatalogEntry, isValidBrandKey } from "./catalog.ts";

describe("isValidBrandKey", () => {
  it("accepts every catalogue key", () => {
    for (const entry of BRAND_CATALOG) {
      expect(isValidBrandKey(entry.key)).toBe(true);
    }
  });

  it("refuses a key the catalogue does not carry", () => {
    expect(isValidBrandKey("netflix")).toBe(false);
    expect(isValidBrandKey("")).toBe(false);
  });

  it("refuses an upstream slug that is not this catalogue's own key", () => {
    // The key is Waltning-owned, never an upstream `simple-icons` slug —
    // even one that looks plausible must not pass.
    expect(isValidBrandKey("simple-icons:orlen")).toBe(false);
  });
});

describe("brandCatalogEntry", () => {
  it("finds an entry by key", () => {
    expect(brandCatalogEntry("orlen")?.name).toBe("ORLEN");
  });

  it("returns undefined for an unknown key", () => {
    expect(brandCatalogEntry("netflix")).toBeUndefined();
  });
});

describe("BRAND_CATALOG shape", () => {
  it("every key is lower-case, permanent-looking (no spaces, no upstream separators)", () => {
    for (const entry of BRAND_CATALOG) {
      expect(entry.key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("no two entries collide on the same folded alias — one non-blank alias wins by construction, and this asserts nothing needs to", () => {
    const seen = new Map<string, string>();
    for (const entry of BRAND_CATALOG) {
      for (const alias of entry.aliases) {
        const folded = fold(alias);
        expect(folded.length).toBeGreaterThan(0);
        const owner = seen.get(folded);
        expect(owner, `alias "${alias}" claimed by both ${owner} and ${entry.key}`).toBeUndefined();
        seen.set(folded, entry.key);
      }
    }
  });

  it("every alias is already in its own folded form, or the matcher can never reach it", () => {
    for (const entry of BRAND_CATALOG) {
      for (const alias of entry.aliases) {
        expect(alias).toBe(fold(alias));
      }
    }
  });

  it("accent is a hex colour and mark is short, for BrandIcon's badge", () => {
    for (const entry of BRAND_CATALOG) {
      expect(entry.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(entry.mark.length).toBeGreaterThan(0);
      expect(entry.mark.length).toBeLessThanOrEqual(2);
    }
  });
});
