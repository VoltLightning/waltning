import { describe, expect, it } from "vitest";
import { NEAR_MATCH_LIMIT, nearMatches } from "./near-matches.ts";

describe("nearMatches", () => {
  /**
   * `Ania`/`Nina` — S15 §9.1's own prose example — shares no trigram under
   * `trigrams.ts`'s `pg_trgm`-style padding (the two names are an anagram of
   * letters, not overlapping substrings), so this exercises the same "typed a
   * near-duplicate spelling" case with a pair the algorithm actually scores
   * above the loose 0.3 floor: a doubled-letter typo.
   */
  it("finds Nina when typing Ninna — a doubled-letter typo", () => {
    const matches = nearMatches("Ninna", [
      { id: "nina", name: "Nina" },
      { id: "marek", name: "Marek" },
    ]);

    expect(matches.map((m) => m.candidate.id)).toEqual(["nina"]);
    expect(matches[0]?.score).toBeGreaterThanOrEqual(0.3);
  });

  it("is fold-insensitive — case and diacritics do not change the score", () => {
    const plain = nearMatches("ninna", [{ id: "nina", name: "Nina" }]);
    const accented = nearMatches("Nińna", [{ id: "nina", name: "Nina" }]);
    expect(plain[0]?.score).toBe(accented[0]?.score);
  });

  it("skips a recorded-distinct pair — the question is never asked again", () => {
    const candidates = [{ id: "nina", name: "Nina" }];

    const withoutRecord = nearMatches("Ninna", candidates, { excludeId: "ninna-draft" });
    expect(withoutRecord.map((m) => m.candidate.id)).toEqual(["nina"]);

    const withRecord = nearMatches("Ninna", candidates, {
      excludeId: "ninna-draft",
      distinctPairs: [["ninna-draft", "nina"]],
    });
    expect(withRecord).toEqual([]);

    // Order-independent — the pair is recorded once, either direction.
    const reversed = nearMatches("Ninna", candidates, {
      excludeId: "ninna-draft",
      distinctPairs: [["nina", "ninna-draft"]],
    });
    expect(reversed).toEqual([]);
  });

  it("never returns more than three, ranked descending, and never the record being edited", () => {
    const self = { id: "self", name: "Nina" };
    const candidates = [
      self,
      { id: "dup", name: "Nina" },
      { id: "b", name: "Ninna" },
      { id: "c", name: "Nino" },
      { id: "d", name: "Niina" },
    ];

    const matches = nearMatches("Nina", candidates, { excludeId: "self" });
    expect(matches.length).toBe(NEAR_MATCH_LIMIT);
    expect(matches.some((m) => m.candidate.id === "self")).toBe(false);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1]?.score ?? 0).toBeGreaterThanOrEqual(matches[i]?.score ?? 0);
    }
  });

  it("excludes anything under the loose 0.3 threshold", () => {
    const matches = nearMatches("Nina", [{ id: "x", name: "Zzyzx Holdings" }]);
    expect(matches).toEqual([]);
  });

  it("is a no-op on an empty or blank typed name", () => {
    expect(nearMatches("", [{ id: "a", name: "Nina" }])).toEqual([]);
    expect(nearMatches("   ", [{ id: "a", name: "Nina" }])).toEqual([]);
  });
});
