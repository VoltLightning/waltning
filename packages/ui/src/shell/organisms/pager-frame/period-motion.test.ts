import { describe, expect, it } from "vitest";
import {
  type Direction,
  enterOffset,
  enterOpacity,
  movesFor,
  stepDirection,
  TRAVEL,
} from "./period-motion.ts";

describe("stepDirection", () => {
  it("does not animate a screen on arrival", () => {
    // There is nothing to have moved from, and a page that slides in on first
    // paint reads as a transition the reader did not ask for.
    expect(stepDirection(null, "2026-09")).toBe(0);
  });

  it("is still for a change that is not one", () => {
    expect(stepDirection("2026-09", "2026-09")).toBe(0);
  });

  it("knows forward from back, by the ordering the date is stored in", () => {
    expect(stepDirection("2026-08", "2026-09")).toBe(1);
    expect(stepDirection("2026-09", "2026-08")).toBe(-1);
  });

  it("crosses a year the same way, because the string does", () => {
    expect(stepDirection("2026-12", "2027-01")).toBe(1);
    expect(stepDirection("2027-01", "2026-12")).toBe(-1);
  });

  it("orders whole dates too, not only months", () => {
    expect(stepDirection("2026-09-08", "2026-09-09")).toBe(1);
  });
});

describe("enterOffset", () => {
  const forward: Direction = 1;
  const back: Direction = -1;

  it("brings a later period in from the right and an earlier one from the left", () => {
    expect(enterOffset(forward, 0)).toBe(TRAVEL);
    expect(enterOffset(back, 0)).toBe(-TRAVEL);
  });

  it("lands both at rest", () => {
    expect(enterOffset(forward, 1)).toBe(0);
    expect(enterOffset(back, 1)).toBeCloseTo(0);
  });

  it("moves nothing when nothing changed", () => {
    expect(enterOffset(0, 0)).toBe(0);
    expect(enterOffset(0, 0.5)).toBe(0);
  });

  it("stays inside its travel however far the value runs", () => {
    for (const progress of [-1, 0, 0.5, 1, 4, Number.NaN]) {
      expect(Math.abs(enterOffset(forward, progress))).toBeLessThanOrEqual(TRAVEL);
    }
  });
});

describe("enterOpacity", () => {
  it("dips rather than disappears", () => {
    // A page that vanishes and returns flickered; one that dips moved. The
    // figures stay readable on the step a reader is watching a number for.
    expect(enterOpacity(0)).toBeGreaterThan(0);
    expect(enterOpacity(0)).toBeLessThan(1);
  });

  it("is fully solid once it has landed, and stays there", () => {
    expect(enterOpacity(1)).toBe(1);
    expect(enterOpacity(3)).toBe(1);
  });

  it("only ever brightens on the way in", () => {
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const now = enterOpacity(p);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it("draws the page rather than hiding it when the value is not a number", () => {
    expect(enterOpacity(Number.NaN)).toBe(1);
  });
});

describe("movesFor", () => {
  it("stays still on a swipe between pages, however much the key moved", () => {
    // Months is keyed on its year and the other three on their month, so a
    // swipe changes the string without changing what is being looked at — and
    // the pager is already animating that swipe.
    expect(
      movesFor({ period: "2026", page: "months" }, { period: "2026-09", page: "summary" }),
    ).toBe(0);
    expect(
      movesFor({ period: "2026-09", page: "summary" }, { period: "2026", page: "months" }),
    ).toBe(0);
  });

  it("stays still when a month is tapped on the page that shows a year", () => {
    // Months draws the same twelve rows either way, with a different one
    // marked. A page that moves when its own contents did not reads as a
    // remount, which is what this was mistaken for.
    expect(movesFor({ period: "2026", page: "months" }, { period: "2026", page: "months" })).toBe(
      0,
    );
  });

  it("moves when the period changes and the page does not", () => {
    expect(
      movesFor({ period: "2026-08", page: "summary" }, { period: "2026-09", page: "summary" }),
    ).toBe(1);
    expect(movesFor({ period: "2026-09", page: "list" }, { period: "2026-08", page: "list" })).toBe(
      -1,
    );
    // Stepping the year on Months is a real change to what that page shows.
    expect(movesFor({ period: "2026", page: "months" }, { period: "2025", page: "months" })).toBe(
      -1,
    );
  });

  it("does not animate a screen on arrival", () => {
    expect(movesFor(null, { period: "2026-09", page: "summary" })).toBe(0);
  });
});
