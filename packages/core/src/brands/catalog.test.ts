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
    // Invented — never a real merchant not already in the catalogue
    // (CLAUDE.md: placeholders only).
    expect(isValidBrandKey("waltco")).toBe(false);
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
    expect(brandCatalogEntry("waltco")).toBeUndefined();
  });
});

describe("BRAND_CATALOG shape", () => {
  it("every key is lower-case, permanent-looking (no spaces, no upstream separators)", () => {
    for (const entry of BRAND_CATALOG) {
      expect(entry.key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  /** `brandCatalogEntry` is a `find`, so it silently returns the first match — a duplicate `key` would shadow its twin with no error anywhere else. */
  it("no two entries share a key", () => {
    const seen = new Set<string>();
    for (const entry of BRAND_CATALOG) {
      expect(seen.has(entry.key), `key "${entry.key}" appears more than once`).toBe(false);
      seen.add(entry.key);
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

/**
 * The contrast guarantee `catalog.ts`'s own comment on the YouTube entry
 * makes ("that fails WCAG AA … darkened just enough to clear 4.5:1"), as a
 * property of `BRAND_CATALOG` itself rather than of any one entry. The visual
 * suite's axe-core pass sees only what a story renders, and
 * `brand-icon.stories.tsx` hand-writes one story per entry — stories that
 * exist per catalogue entry but not *because* of the catalogue, so an entry
 * added without a story would ship its accent unchecked. This is the
 * enforcement; the stories are a second look at what it already refuses.
 *
 * **WCAG relative luminance, computed here rather than imported** — `core`'s
 * dependency floor is decimal.js and zod (`tests/architecture.test.ts`), and
 * `packages/ui/src/theme/theme.test.tsx` already has an equivalent
 * `contrastRatio` helper that this deliberately does not import: pulling in
 * `packages/ui` from a `packages/core` test would cross the one dependency
 * direction the architecture test enforces, for a formula short enough to
 * not be worth the cross-package coupling.
 */
describe("BRAND_CATALOG accent contrast", () => {
  // `packages/ui/src/theme/roles.ts` — `textOnAccent` is `#ffffff` in both
  // the light and the dark theme, so both are named explicitly rather than
  // assuming one covers the other; a future theme that splits them needs
  // this test updated by hand, which is the point of citing the file here.
  const TEXT_ON_ACCENT_LIGHT = "#ffffff";
  const TEXT_ON_ACCENT_DARK = "#ffffff";
  /** WCAG AA, normal (non-large) text — `design-system/10`. */
  const MIN_CONTRAST = 4.5;

  function srgbToLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(hex: string): number {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  }

  function contrastRatio(hexA: string, hexB: string): number {
    const a = relativeLuminance(hexA);
    const b = relativeLuminance(hexB);
    const [lighter, darker] = a > b ? [a, b] : [b, a];
    return (lighter + 0.05) / (darker + 0.05);
  }

  it("every accent clears WCAG AA against textOnAccent, in both themes", () => {
    for (const entry of BRAND_CATALOG) {
      for (const ink of [TEXT_ON_ACCENT_LIGHT, TEXT_ON_ACCENT_DARK]) {
        const ratio = contrastRatio(entry.accent, ink);
        expect(
          ratio,
          `${entry.key} (${entry.accent}) against ${ink}: ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });
});
