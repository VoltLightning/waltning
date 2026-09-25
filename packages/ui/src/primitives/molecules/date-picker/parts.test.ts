import { describe, expect, it } from "vitest";
import { clampDay, dateOf, daysIn, partsOf, yearsAround } from "./parts.ts";

describe("how long a month is", () => {
  it("knows the short ones and the leap years", () => {
    expect(daysIn(2026, 0), "January").toBe(31);
    expect(daysIn(2026, 1), "February 2026").toBe(28);
    expect(daysIn(2024, 1), "February 2024, a leap year").toBe(29);
    expect(daysIn(2100, 1), "February 2100, a century that is not").toBe(28);
    expect(daysIn(2000, 1), "February 2000, a century that is").toBe(29);
    expect(daysIn(2026, 3), "April").toBe(30);
  });
});

describe("clamping is final", () => {
  it("lands 31 January on the 28th of February", () => {
    expect(clampDay(2026, 1, 31)).toBe(28);
    expect(clampDay(2024, 1, 31), "and on the 29th in a leap year").toBe(29);
  });

  /**
   * The decision §3.7a records: the value is whatever the wheel is showing,
   * so a day lost to a short month stays lost. This is the assertion that
   * would fail if anyone reintroduced a remembered "intended" day.
   */
  it("does not restore the day after rolling back to a long month", () => {
    const short = clampDay(2026, 1, 31);
    expect(clampDay(2026, 0, short), "back in January").toBe(28);
  });

  it("never lands below the first", () => {
    expect(clampDay(2026, 1, 0)).toBe(1);
  });
});

describe("a date and its parts", () => {
  it("round-trips", () => {
    expect(dateOf(partsOf("2026-09-18"))).toBe("2026-09-18");
    expect(partsOf("2026-09-18")).toEqual({ year: 2026, month: 8, day: 18 });
  });

  it("pads a single digit on the way back", () => {
    expect(dateOf({ year: 2026, month: 0, day: 3 })).toBe("2026-01-03");
  });

  it("clamps rather than rolling into the next month", () => {
    // `Date.UTC` would happily turn this into 2026-03-03. A ledger date that
    // silently became a different month is the defect `isRealCalendarDate`
    // exists to catch downstream; the picker must never produce one.
    expect(dateOf({ year: 2026, month: 1, day: 31 })).toBe("2026-02-28");
  });
});

describe("the years on offer", () => {
  it("runs a century either side of today", () => {
    const years = yearsAround(2026, 2026);
    expect(years[0], "a hundred back").toBe(1926);
    expect(years.at(-1), "a hundred ahead").toBe(2126);
    expect(years).toHaveLength(201);
  });

  /** Anchored on today: rolling the wheel does not move the column under it. */
  it("stays put for any value inside the window", () => {
    expect(yearsAround(1990, 2026)).toEqual(yearsAround(2026, 2026));
  });

  it("widens rather than leaving an older value off the wheel", () => {
    const years = yearsAround(1901, 2026);
    expect(years[0]).toBe(1901);
    expect(years.at(-1)).toBe(2126);
  });
});
