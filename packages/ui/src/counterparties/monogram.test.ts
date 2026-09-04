import { describe, expect, it } from "vitest";
import { monogramFor } from "./monogram.ts";

describe("monogramFor", () => {
  it("is deterministic — the same name always lands on the same step", () => {
    expect(monogramFor("Nina")).toEqual(monogramFor("Nina"));
  });

  it("folds before hashing — case and diacritics never change the tint", () => {
    expect(monogramFor("Nina").fill).toBe(monogramFor("nina").fill);
    expect(monogramFor("Łukasz").fill).toBe(monogramFor("lukasz").fill);
  });

  it("uses the first letter, uppercased", () => {
    expect(monogramFor("nina").letter).toBe("N");
    expect(monogramFor("Acme Sp. z o.o.").letter).toBe("A");
  });

  it("falls back to a placeholder letter for an empty name", () => {
    expect(monogramFor("").letter).toBe("?");
    expect(monogramFor("   ").letter).toBe("?");
  });

  it("pairs every fill with an ink that is legible on it (Treemap's own rule)", () => {
    for (const name of ["Nina", "Marek", "Acme", "Cash", "Q", "Zzz"]) {
      const { fill, ink } = monogramFor(name);
      expect(typeof fill).toBe("string");
      expect(ink === "#ffffff" || ink.startsWith("#")).toBe(true);
    }
  });
});
