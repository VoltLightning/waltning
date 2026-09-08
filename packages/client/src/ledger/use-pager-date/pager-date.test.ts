import { accountingDate, yearMonth } from "@waltning/core/date";
import { describe, expect, it } from "vitest";
import {
  enterDay,
  enterMonth,
  goToPage,
  type PagerState,
  periodLabel,
  step,
  stepUnitOf,
} from "./pager-date.ts";

const TODAY = accountingDate("2026-09-08");
const on = (date: string, page: PagerState["page"] = "list"): PagerState => ({
  date: accountingDate(date),
  page,
});

describe("stepUnitOf", () => {
  it("steps a year on Months and a month everywhere else", () => {
    // An arrow that moved a month on Months would scroll a list of months by
    // one of its own rows: the reader steps and sees almost the same page.
    expect(stepUnitOf("months")).toBe("year");
    for (const page of ["summary", "list", "calendar"] as const) {
      expect(stepUnitOf(page)).toBe("month");
    }
  });
});

describe("step", () => {
  it("moves one month on the day pages", () => {
    expect(step(on("2026-09-08"), -1).date).toBe("2026-08-08");
    expect(step(on("2026-09-08"), 1).date).toBe("2026-10-08");
  });

  it("moves a whole year on Months", () => {
    expect(step(on("2026-09-08", "months"), -1).date).toBe("2025-09-08");
  });

  it("clamps a day past the end of the month it lands in", () => {
    // 31 January stepped forward is 28 February, not 3 March. `Date.UTC` rolls
    // the overflow into the next month, which makes one press skip a month —
    // and skip it only sometimes, which is the shape of a bug nobody
    // reproduces.
    expect(step(on("2026-01-31"), 1).date).toBe("2026-02-28");
    expect(step(on("2026-03-31"), -1).date).toBe("2026-02-28");
  });

  it("keeps the day where the month is long enough", () => {
    expect(step(on("2026-01-15"), 1).date).toBe("2026-02-15");
  });

  it("crosses a year boundary", () => {
    expect(step(on("2026-12-08"), 1).date).toBe("2027-01-08");
    expect(step(on("2026-01-08"), -1).date).toBe("2025-12-08");
  });

  it("never changes the page", () => {
    expect(step(on("2026-09-08", "calendar"), 1).page).toBe("calendar");
  });
});

describe("enterMonth", () => {
  it("lands on the month's newest day, not its first", () => {
    // The list is reverse-chronological: landing on the 1st puts the reader at
    // the end of the month with the whole of it behind them.
    expect(enterMonth(on("2026-09-08"), yearMonth("2026-08"), TODAY).date).toBe("2026-08-31");
    expect(enterMonth(on("2026-09-08"), yearMonth("2026-02"), TODAY).date).toBe("2026-02-28");
  });

  it("lands on today when the month is the current one", () => {
    // Today is where the current month's newest row is; 30 September is a day
    // that has not happened.
    expect(enterMonth(on("2026-03-04"), yearMonth("2026-09"), TODAY).date).toBe("2026-09-08");
  });

  it("lands on the last day of a month in a future year", () => {
    expect(enterMonth(on("2026-09-08"), yearMonth("2027-04"), TODAY).date).toBe("2027-04-30");
  });
});

describe("enterDay and goToPage", () => {
  it("keeps the date when only the page changes, which is the whole point", () => {
    const state = goToPage(on("2026-05-25", "list"), "calendar");
    expect(state).toEqual({ date: "2026-05-25", page: "calendar" });
  });

  it("keeps the page when only the day changes", () => {
    expect(enterDay(on("2026-09-08", "calendar"), accountingDate("2026-05-25"))).toEqual({
      date: "2026-05-25",
      page: "calendar",
    });
  });
});

describe("periodLabel", () => {
  it("hides the year while the period is in the current one", () => {
    expect(periodLabel(on("2026-09-08"), TODAY)).toEqual({
      unit: "month",
      month: "2026-09",
      showYear: false,
    });
  });

  it("shows the year once you have stepped out of it", () => {
    expect(periodLabel(on("2024-03-04"), TODAY)).toEqual({
      unit: "month",
      month: "2024-03",
      showYear: true,
    });
  });

  it("says the year on Months, where the year is the period", () => {
    expect(periodLabel(on("2026-09-08", "months"), TODAY)).toEqual({ unit: "year", year: 2026 });
  });

  it("hands back parts, never a formatted string", () => {
    // `packages/client` may not import `packages/ui`, so it cannot know a
    // month's name in the reader's language — and must not guess at one.
    const label = periodLabel(on("2026-09-08"), TODAY);
    expect(JSON.stringify(label)).not.toContain("September");
  });
});
