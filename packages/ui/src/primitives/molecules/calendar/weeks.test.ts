import { describe, expect, it } from "vitest";
import { headingDates, weeksOf } from "./weeks.ts";

const flat = (year: number, month: number, start: 0 | 1) => weeksOf(year, month, start).flat();

describe("a month's grid", () => {
  it("is always six rows of seven", () => {
    for (const [year, month] of [
      [2026, 1],
      [2026, 8],
      [2024, 1],
      [2026, 11],
    ] as const) {
      const weeks = weeksOf(year, month, 1);
      expect(weeks, `${year}-${month + 1}`).toHaveLength(6);
      for (const week of weeks) expect(week).toHaveLength(7);
    }
  });

  it("starts the week where the locale does", () => {
    // 1 September 2026 is a Tuesday.
    expect(flat(2026, 8, 1)[0]?.date, "Monday-first").toBe("2026-08-31");
    expect(flat(2026, 8, 0)[0]?.date, "Sunday-first").toBe("2026-08-30");
  });

  it("fills the lead and the tail from the neighbouring months", () => {
    const cells = flat(2026, 8, 1);
    expect(cells[0]?.inMonth, "the lead belongs to August").toBe(false);
    expect(cells[1]?.date, "and September starts right after it").toBe("2026-09-01");
    expect(cells[1]?.inMonth).toBe(true);
    expect(cells.at(-1)?.inMonth, "the tail belongs to October").toBe(false);
  });

  it("crosses a year in both directions", () => {
    expect(
      flat(2026, 0, 1).some((c) => c.date.startsWith("2025-12")),
      "January leads from December",
    ).toBe(true);
    expect(
      flat(2026, 11, 1).some((c) => c.date.startsWith("2027-01")),
      "December tails into January",
    ).toBe(true);
  });

  it("holds every day of the month exactly once", () => {
    for (const [year, month, length] of [
      [2026, 1, 28],
      [2024, 1, 29],
      [2026, 8, 30],
      [2026, 0, 31],
    ] as const) {
      const own = flat(year, month, 1).filter((c) => c.inMonth);
      expect(own, `${year}-${month + 1}`).toHaveLength(length);
      expect(new Set(own.map((c) => c.date)).size, "no repeats").toBe(length);
    }
  });
});

describe("the column headings", () => {
  it("are seven distinct days in the week's own order", () => {
    for (const start of [0, 1] as const) {
      const days = headingDates(start);
      expect(days).toHaveLength(7);
      expect(new Set(days).size, "distinct, so a shared initial cannot collide them").toBe(7);
    }
  });
});
