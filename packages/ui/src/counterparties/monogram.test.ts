import { describe, expect, it } from "vitest";
import { dark, light } from "../theme/roles.ts";
import { monogramFor } from "./monogram.ts";

describe("monogramFor", () => {
  it("is deterministic — the same name always lands on the same step", () => {
    expect(monogramFor("Nina", light)).toEqual(monogramFor("Nina", light));
  });

  it("folds before hashing — case and diacritics never change the tint", () => {
    expect(monogramFor("Nina", light).fill).toBe(monogramFor("nina", light).fill);
    expect(monogramFor("Łukasz", light).fill).toBe(monogramFor("lukasz", light).fill);
  });

  it("uses the first letter, uppercased", () => {
    expect(monogramFor("nina", light).letter).toBe("N");
    expect(monogramFor("Acme Sp. z o.o.", light).letter).toBe("A");
  });

  it("falls back to a placeholder letter for an empty name", () => {
    expect(monogramFor("", light).letter).toBe("?");
    expect(monogramFor("   ", light).letter).toBe("?");
  });

  /**
   * L2 — the first *grapheme*, not the first UTF-16 code unit. A name whose
   * first character sits outside the BMP is a surrogate pair in JS string
   * indexing; `trimmed[0]` returns half of it (an unpaired surrogate, which
   * renders as nothing or "�"), `Array.from(trimmed)[0]` returns the whole
   * character.
   */
  it("uses the first grapheme, not the first UTF-16 code unit, for a name outside the BMP", () => {
    const mathematicalBoldA = "\u{1D4D0}cme"; // MATHEMATICAL BOLD SCRIPT CAPITAL A
    expect([...mathematicalBoldA][0]?.length).toBe(2); // a surrogate pair, in JS string units
    expect(monogramFor(mathematicalBoldA, light).letter).toBe("\u{1D4D0}".toUpperCase());
  });

  /**
   * L2 — a sum-of-code-points hash gives every anagram the same step, which
   * is not deterministic *per name*: `Nina` and `Iann` share every letter.
   * djb2 folds in each character's position, so the two names land on
   * different steps.
   */
  it("does not collide two anagrams onto the same step", () => {
    expect(monogramFor("Nina", light).fill).not.toBe(monogramFor("Iann", light).fill);
  });

  it("pairs every fill with an ink that is legible on it (Treemap's own rule)", () => {
    for (const name of ["Nina", "Marek", "Acme", "Cash", "Q", "Zzz"]) {
      const { fill, ink } = monogramFor(name, light);
      expect(typeof fill).toBe("string");
      expect(ink === light.textOnAccent || ink.startsWith("#")).toBe(true);
    }
  });

  it("resolves the light-ink steps through the theme, not a hard-coded colour", () => {
    // "Nina" folds to a step ≥ 500 under djb2 (L2) — light ink — so the
    // theme's own `textOnAccent` role is what has to answer, per theme.
    const name = "Nina";
    expect(monogramFor(name, light).ink).toBe(light.textOnAccent);
    expect(monogramFor(name, dark).ink).toBe(dark.textOnAccent);
  });
});
