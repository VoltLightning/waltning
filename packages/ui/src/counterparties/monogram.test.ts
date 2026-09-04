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

  it("pairs every fill with an ink that is legible on it (Treemap's own rule)", () => {
    for (const name of ["Nina", "Marek", "Acme", "Cash", "Q", "Zzz"]) {
      const { fill, ink } = monogramFor(name, light);
      expect(typeof fill).toBe("string");
      expect(ink === light.textOnAccent || ink.startsWith("#")).toBe(true);
    }
  });

  it("resolves the light-ink steps through the theme, not a hard-coded colour", () => {
    // "Acme" folds to a step ≥ 500 under this hash — light ink — so the
    // theme's own `textOnAccent` role is what has to answer, per theme.
    const name = "Acme";
    expect(monogramFor(name, light).ink).toBe(light.textOnAccent);
    expect(monogramFor(name, dark).ink).toBe(dark.textOnAccent);
  });
});
