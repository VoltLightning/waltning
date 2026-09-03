import { describe, expect, it } from "vitest";
import { jaccard, trigrams } from "./trigrams.ts";

describe("trigrams / jaccard", () => {
  it("scores a one-letter typo as similar", () => {
    expect(jaccard(trigrams("coffee"), trigrams("coffe"))).toBeGreaterThan(0.6);
  });

  it("scores unrelated words as dissimilar", () => {
    expect(jaccard(trigrams("coffee"), trigrams("taxi"))).toBeLessThan(0.1);
  });

  it("scores identical strings as 1", () => {
    expect(jaccard(trigrams("coffee"), trigrams("coffee"))).toBe(1);
  });
});
