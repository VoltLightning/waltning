import { accountingDate, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import type { MonthDay, MonthWeek } from "./month-grid.ts";
import { monthGrid, weekdayHeadings } from "./month-grid.ts";

const SEPTEMBER = yearMonth("2026-09");
const TODAY = accountingDate("2026-09-08");

/** The drawn days of a grid — the blanks belong to the months either side. */
function daysOf(grid: readonly MonthWeek[]): readonly MonthDay[] {
  return grid.flat().filter((cell): cell is MonthDay => !("blank" in cell));
}

function flow(date: string, over: Partial<money.DayFlowRow> = {}): money.DayFlowRow {
  return {
    date: accountingDate(date),
    currency: "PLN" as money.CurrencyCode,
    decimals: 2,
    spend: money.ZERO,
    inflow: money.ZERO,
    ...over,
  };
}

describe("the shape of the grid", () => {
  it("gives whole weeks, so the columns line up under their headings", () => {
    for (const week of monthGrid([], SEPTEMBER, TODAY, 1)) {
      expect(week).toHaveLength(7);
    }
  });

  it("pads the days before the 1st rather than starting the row early", () => {
    // 1 September 2026 is a Tuesday. Monday-first, that is one blank.
    const [first] = monthGrid([], SEPTEMBER, TODAY, 1);
    // The blank is 31 August, its real date — a cell is never identified by
    // where it sits in the row.
    expect(first?.[0]).toEqual({ blank: true, date: "2026-08-31" });
    expect(first?.[1]).toMatchObject({ day: 1 });
  });

  it("moves the padding when the week starts on Sunday", () => {
    const [first] = monthGrid([], SEPTEMBER, TODAY, 0);
    expect(first?.[0]).toEqual({ blank: true, date: "2026-08-30" });
    expect(first?.[1]).toEqual({ blank: true, date: "2026-08-31" });
    expect(first?.[2]).toMatchObject({ day: 1 });
  });

  it("draws every day of the month, whatever its length", () => {
    const days = (month: string) => daysOf(monthGrid([], yearMonth(month), TODAY, 1)).length;
    expect(days("2026-09")).toBe(30);
    expect(days("2026-02")).toBe(28);
    // 2028 is a leap year, and the 29th is the day a hand-rolled length loses.
    expect(days("2028-02")).toBe(29);
  });
});

describe("what a day is worth", () => {
  it("marks a day with nothing on it as none, not as zero movement", () => {
    const grid = monthGrid(
      [flow("2026-09-04", { spend: money.toMoney("30") })],
      SEPTEMBER,
      TODAY,
      1,
    );
    const cells = daysOf(grid);
    // The 4th is `heavy` because it is the only day and therefore the largest —
    // the same construction `ribbonDays` uses. What matters here is the 5th: a
    // day the ledger has nothing for is `none`, drawn by the absence of a mark
    // rather than by a mark saying zero.
    expect(cells.find((c) => c.day === 4)?.activity).toBe("heavy");
    expect(cells.find((c) => c.day === 5)?.activity).toBe("none");
    expect(cells.find((c) => c.day === 5)?.net).toEqual(money.ZERO);
  });

  it("classes heavy against the month on screen, not against a fixed figure", () => {
    // The mark says "unusual for you". Half the largest day is the threshold,
    // so the biggest day is heavy by construction whatever the ledger's scale.
    const grid = monthGrid(
      [
        flow("2026-09-02", { spend: money.toMoney("1000") }),
        flow("2026-09-03", { spend: money.toMoney("600") }),
        flow("2026-09-04", { spend: money.toMoney("50") }),
      ],
      SEPTEMBER,
      TODAY,
      1,
    );
    const by = new Map(daysOf(grid).map((c) => [c.day, c]));
    expect(by.get(2)?.activity).toBe("heavy");
    expect(by.get(3)?.activity).toBe("heavy");
    expect(by.get(4)?.activity).toBe("some");
  });

  it("calls a day that nets to zero flat, never nothing", () => {
    // Money moved and none of it left — a day of transfers between your own
    // accounts. Neither colour is the honest mark for it.
    const grid = monthGrid(
      [flow("2026-09-04", { spend: money.toMoney("80"), inflow: money.toMoney("80") })],
      SEPTEMBER,
      TODAY,
      1,
    );
    const day = daysOf(grid).find((cell) => cell.day === 4);
    expect(day?.direction).toBe("flat");
    expect(day?.activity).toBe("some");
  });

  it("takes the direction from the day's net", () => {
    const grid = monthGrid(
      [
        flow("2026-09-02", { spend: money.toMoney("80") }),
        flow("2026-09-03", { inflow: money.toMoney("80") }),
      ],
      SEPTEMBER,
      TODAY,
      1,
    );
    const by = new Map(daysOf(grid).map((c) => [c.day, c]));
    expect(by.get(2)?.direction).toBe("out");
    expect(by.get(3)?.direction).toBe("in");
  });

  it("refuses a figure for a day holding two currencies, and still marks it", () => {
    // `dayFlows` will not fold them and neither will this: something happened,
    // and no single number is true.
    const grid = monthGrid(
      [
        flow("2026-09-04", { spend: money.toMoney("30") }),
        flow("2026-09-04", { currency: "USD" as money.CurrencyCode, spend: money.toMoney("7") }),
      ],
      SEPTEMBER,
      TODAY,
      1,
    );
    const day = daysOf(grid).find((cell) => cell.day === 4);
    expect(day?.net).toBeNull();
    expect(day?.activity).toBe("some");
  });

  it("keeps a two-currency day out of the heavy threshold", () => {
    // Its size is unknown, so letting it set the scale would class every other
    // day against a figure nobody computed.
    const grid = monthGrid(
      [
        flow("2026-09-04", { spend: money.toMoney("1000000") }),
        flow("2026-09-04", { currency: "USD" as money.CurrencyCode, spend: money.toMoney("7") }),
        flow("2026-09-06", { spend: money.toMoney("50") }),
      ],
      SEPTEMBER,
      TODAY,
      1,
    );
    expect(daysOf(grid).find((cell) => cell.day === 6)?.activity).toBe("heavy");
  });

  it("marks the days after today as ahead", () => {
    const by = new Map(daysOf(monthGrid([], SEPTEMBER, TODAY, 1)).map((c) => [c.day, c]));
    expect(by.get(8)?.ahead).toBe(false);
    expect(by.get(9)?.ahead).toBe(true);
  });
});

describe("weekdayHeadings", () => {
  it("gives one of each weekday, starting where the week does", () => {
    const monday = weekdayHeadings(1);
    const sunday = weekdayHeadings(0);
    expect(monday).toHaveLength(7);
    expect(new Set(monday).size).toBe(7);
    expect(monday[0]).toBe("2026-03-02");
    expect(sunday[0]).toBe("2026-03-01");
  });
});
