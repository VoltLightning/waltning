import { accountingDate } from "@waltning/core/date";
import { describe, expect, it } from "vitest";
import { groupByDay } from "./group-by-day.ts";

function row(date: string, payee: string) {
  return { date: accountingDate(date), payee };
}

const LABELS = {
  today: accountingDate("2026-09-04"),
  yesterday: accountingDate("2026-09-03"),
  todayLabel: "Today",
  yesterdayLabel: "Yesterday",
};

describe("groupByDay", () => {
  it("labels today and yesterday, and falls back to the bare date", () => {
    const sections = groupByDay(
      [row("2026-09-04", "A"), row("2026-09-03", "B"), row("2026-08-20", "C")],
      LABELS,
    );
    expect(sections.map((s) => s.label)).toEqual(["Today", "Yesterday", "2026-08-20"]);
    expect(sections.map((s) => s.rows.map((r) => r.payee))).toEqual([["A"], ["B"], ["C"]]);
  });

  it("groups every row of one contiguous date into one section", () => {
    const sections = groupByDay(
      [row("2026-09-04", "A"), row("2026-09-04", "B"), row("2026-09-03", "C")],
      LABELS,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.rows.map((r) => r.payee)).toEqual(["A", "B"]);
  });

  it("returns nothing for an empty page", () => {
    expect(groupByDay([], LABELS)).toEqual([]);
  });
});
