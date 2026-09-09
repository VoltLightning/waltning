import { accountingDate, yearMonth } from "@waltning/core/date";
import { expect, it } from "vitest";
import { matchesByDay, matchesByMonth, totalMatches } from "./match-counts.ts";

const days = [
  { date: accountingDate("2026-03-02"), count: 2 },
  { date: accountingDate("2026-03-19"), count: 1 },
  { date: accountingDate("2026-05-04"), count: 4 },
];

it("keys the days a grid looks up one cell at a time", () => {
  const byDay = matchesByDay(days);
  expect(byDay.get("2026-03-02")).toBe(2);
  // Absent, not zero: the grid knows which days it draws, and a `0` invented
  // here would be this module handing the calendar its own shape back.
  expect(byDay.get("2026-03-03")).toBeUndefined();
});

it("adds a month's days together", () => {
  const byMonth = matchesByMonth(days);
  expect(byMonth.get(yearMonth("2026-03"))).toBe(3);
  expect(byMonth.get(yearMonth("2026-05"))).toBe(4);
  expect(byMonth.get(yearMonth("2026-04"))).toBeUndefined();
});

it("totals the period, which is what the field's own line states", () => {
  expect(totalMatches(days)).toBe(7);
  expect(totalMatches([])).toBe(0);
});

/**
 * The read returns one entry per day, but a caller that concatenated two
 * periods would hand over two entries for the same day. Adding rather than
 * overwriting is the difference between a count and the last count.
 */
it("adds repeated days rather than replacing them", () => {
  const doubled = [...days, { date: accountingDate("2026-03-02"), count: 5 }];
  expect(matchesByDay(doubled).get("2026-03-02")).toBe(7);
  expect(matchesByMonth(doubled).get(yearMonth("2026-03"))).toBe(8);
});
