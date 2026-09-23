import { toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { splitByWeight, splitEvenly, splitSummary } from "./split-shares.ts";

const m = (v: string) => toMoney(v);

describe("splitEvenly — J08 §5", () => {
  it("sums back to the total exactly", () => {
    const shares = splitEvenly(m("400.00"), 4, 2);
    expect(shares.map((s) => s.slice(0, 6))).toEqual(["100.00", "100.00", "100.00", "100.00"]);
  });

  it("hands the leftover grosz to the payer, who is first", () => {
    // §5's own worked example: three ways on 100,00 is 33,34 / 33,33 / 33,33,
    // and the interface says which is which because index 0 is yours.
    const shares = splitEvenly(m("100.00"), 3, 2);
    expect(shares.map((s) => s.slice(0, 5))).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("answers nothing for nobody", () => {
    expect(splitEvenly(m("100.00"), 0, 2)).toEqual([]);
  });
});

describe("splitByWeight — J08's Shares", () => {
  it("splits 2·1·1 the way the weights say", () => {
    const shares = splitByWeight(m("400.00"), [2, 1, 1], 2);
    expect(shares.map((s) => s.slice(0, 6))).toEqual(["200.00", "100.00", "100.00"]);
  });

  it("still sums back exactly when the weights do not divide", () => {
    const shares = splitByWeight(m("100.00"), [2, 1], 2);
    expect(shares.map((s) => s.slice(0, 5))).toEqual(["66.67", "33.33"]);
  });
});

describe("splitSummary — S36 §3's *left to allocate*", () => {
  it("reads complete when nothing is left", () => {
    const s = splitSummary(m("400.00"), [m("100.00"), m("300.00")], 2);
    expect(s.complete).toBe(true);
    expect(s.over).toBe(false);
    expect(s.remaining.slice(0, 4)).toBe("0.00");
  });

  it("states what is left when the split does not sum", () => {
    const s = splitSummary(m("400.00"), [m("100.00")], 2);
    expect(s.complete).toBe(false);
    expect(s.remaining.slice(0, 6)).toBe("300.00");
  });

  it("says over when more is handed out than the pot holds", () => {
    const s = splitSummary(m("100.00"), [m("60.00"), m("60.00")], 2);
    expect(s.over).toBe(true);
    expect(s.complete).toBe(false);
  });

  it("reads dust below the currency's scale as complete", () => {
    // Otherwise the screen withholds a commit over a figure it is drawing
    // as `0,00` — the same rounding `directionTotals` takes.
    const s = splitSummary(m("100.00"), [m("99.996")], 2);
    expect(s.complete).toBe(true);
  });
});
