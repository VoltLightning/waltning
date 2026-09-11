import { accountingDate } from "@waltning/core/date";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { type LedgerDayRow, ribbonDays, toLedgerItems } from "./ledger-days.ts";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");

function row(date: string, amount: string, over: Partial<LedgerDayRow> = {}): LedgerDayRow {
  return {
    date: accountingDate(date),
    amount: toMoney(amount),
    currency: PLN,
    fxRate: pivotPerUnit("1"),
    fxRateEstimated: false,
    toAmount: null,
    toCurrency: null,
    toFxRate: null,
    ...over,
  };
}

const kinds = (items: readonly { kind: string }[]) => items.map((i) => i.kind);

describe("toLedgerItems", () => {
  it("groups contiguous rows into one day, newest first", () => {
    const items = toLedgerItems(
      [row("2026-08-14", "-10"), row("2026-08-14", "-20"), row("2026-08-13", "-5")],
      PLN,
    );
    expect(kinds(items)).toEqual(["day", "day"]);
    expect(items[0]).toMatchObject({ date: "2026-08-14" });
    expect(items[0]?.kind === "day" && items[0].rows).toHaveLength(2);
  });

  it("totals a day in the pivot currency, signs kept", () => {
    const items = toLedgerItems([row("2026-08-14", "-96"), row("2026-08-14", "-48.90")], PLN);
    expect(items[0]?.kind === "day" && items[0].total).toEqual({
      kind: "total",
      pivot: toMoney("-144.90"),
      approximate: false,
      estimated: false,
    });
  });

  it("marks a mixed-currency day approximate, converting at each row's own rate", () => {
    const items = toLedgerItems(
      [
        row("2026-08-14", "-100"),
        row("2026-08-14", "-40", { currency: EUR, fxRate: pivotPerUnit("4.15") }),
      ],
      PLN,
    );
    // −100 zł and −40 € at 4,15 → −100 + −166 = −266
    expect(items[0]?.kind === "day" && items[0].total).toEqual({
      kind: "total",
      pivot: toMoney("-266"),
      approximate: true,
      estimated: false,
    });
  });

  it("reports an estimated rate without hiding the figure", () => {
    const items = toLedgerItems(
      [
        row("2026-08-14", "-40", {
          currency: EUR,
          fxRate: pivotPerUnit("4"),
          fxRateEstimated: true,
        }),
      ],
      PLN,
    );
    expect(items[0]?.kind === "day" && items[0].total).toMatchObject({
      kind: "total",
      approximate: true,
      estimated: true,
    });
  });

  it("gives a day with an unpriceable leg no total at all, rather than a smaller one", () => {
    const items = toLedgerItems(
      [
        row("2026-08-14", "-100"),
        row("2026-08-14", "-50", {
          toAmount: toMoney("50"),
          toCurrency: EUR,
          toFxRate: null,
        }),
      ],
      PLN,
    );
    // Not −100: a total that added only the legs it could price would present
    // a smaller number as the day's figure.
    expect(items[0]?.kind === "day" && items[0].total).toEqual({ kind: "unpriced" });
  });

  it("counts both legs of a transfer", () => {
    const items = toLedgerItems(
      [
        row("2026-08-14", "-200", {
          toAmount: toMoney("200"),
          toCurrency: PLN,
          toFxRate: pivotPerUnit("1"),
        }),
      ],
      PLN,
    );
    expect(items[0]?.kind === "day" && items[0].total).toMatchObject({ pivot: toMoney("0") });
  });

  it("draws one quiet day between two days that are two apart", () => {
    const items = toLedgerItems([row("2026-08-14", "-10"), row("2026-08-12", "-10")], PLN);
    expect(kinds(items)).toEqual(["day", "quiet", "day"]);
    expect(items[1]).toEqual({
      kind: "quiet",
      from: "2026-08-13",
      to: "2026-08-13",
      days: 1,
    });
  });

  it("collapses a long quiet run into one item — 25 days is not 25 rows", () => {
    const items = toLedgerItems([row("2026-08-28", "-10"), row("2026-08-02", "-10")], PLN);
    expect(kinds(items)).toEqual(["day", "quiet", "day"]);
    expect(items[1]).toEqual({
      kind: "quiet",
      from: "2026-08-27",
      to: "2026-08-03",
      days: 25,
    });
  });

  it("draws nothing between consecutive days", () => {
    const items = toLedgerItems([row("2026-08-14", "-10"), row("2026-08-13", "-10")], PLN);
    expect(kinds(items)).toEqual(["day", "day"]);
  });

  it("never draws a quiet run past either end of what was loaded", () => {
    // The day after the newest row and the day before the oldest are not known
    // to be empty — they are known to be unloaded.
    const items = toLedgerItems([row("2026-08-14", "-10")], PLN);
    expect(kinds(items)).toEqual(["day"]);
  });

  it("spans a month boundary", () => {
    const items = toLedgerItems([row("2026-09-02", "-10"), row("2026-08-30", "-10")], PLN);
    expect(items[1]).toEqual({ kind: "quiet", from: "2026-09-01", to: "2026-08-31", days: 2 });
  });

  it("returns nothing for no rows", () => {
    expect(toLedgerItems([], PLN)).toEqual([]);
  });
});

describe("ribbonDays", () => {
  const day = (date: string, ...amounts: string[]) => amounts.map((a) => row(date, a));

  it("makes heavy relative to what is on screen, not to an absolute figure", () => {
    // A ledger whose largest day is 200 and one whose largest is 20 000 would
    // otherwise draw every mark the same size — the mark exists to say this
    // day was unusual for you.
    const items = toLedgerItems(
      [...day("2026-08-14", "-200"), ...day("2026-08-13", "-20"), ...day("2026-08-12", "-120")],
      PLN,
    );
    expect(ribbonDays(items).map((d) => d.activity)).toEqual(["heavy", "some", "heavy"]);
  });

  it("calls a day that nets to zero with rows on it flat, never in or out", () => {
    // Transfers between your own accounts: money moved and none of it left.
    const items = toLedgerItems([...day("2026-08-14", "-100", "100")], PLN);
    expect(ribbonDays(items)[0]).toMatchObject({ direction: "flat", activity: "some" });
  });

  it("reads a positive day as in", () => {
    const items = toLedgerItems([...day("2026-08-14", "7850")], PLN);
    expect(ribbonDays(items)[0]).toMatchObject({ direction: "in" });
  });

  it("says something happened on a day it cannot price, and no more", () => {
    const items = toLedgerItems(
      [row("2026-08-14", "-50", { toAmount: toMoney("50"), toCurrency: EUR, toFxRate: null })],
      PLN,
    );
    expect(ribbonDays(items)[0]).toMatchObject({
      activity: "some",
      direction: "flat",
      pivot: null,
    });
  });

  it("counts the entries, so the label can say how many", () => {
    const items = toLedgerItems([...day("2026-08-14", "-10", "-20", "-30")], PLN);
    expect(ribbonDays(items)[0]?.entries).toBe(3);
  });

  /**
   * **The list runs newest-first and the strip does not.**
   *
   * Handed the list's order unchanged, the ribbon drew `11 10 9 8 7` left to
   * right — a week running backwards under the tabs, beside a `MonthGrid` on
   * the next page of the same screen running forwards. Reverse-chronological is
   * a rule about reading a ledger down a page; it does not survive the turn
   * onto a horizontal axis, and both languages this app ships read left to
   * right.
   */
  it("runs earliest-first, whichever way the list it came from ran", () => {
    const items = toLedgerItems(
      [...day("2026-08-14", "-200"), ...day("2026-08-13", "-20"), ...day("2026-08-12", "-120")],
      PLN,
    );
    expect(items[0]).toMatchObject({ date: "2026-08-14" });
    expect(ribbonDays(items).map((d) => d.date)).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("runs earliest-first under a search too, where it is not continuous", () => {
    // A strip that changed direction when a query was typed would be two
    // controls wearing one name.
    const items = toLedgerItems([...day("2026-08-14", "-200"), ...day("2026-08-10", "-20")], PLN, {
      filtered: true,
    });
    expect(ribbonDays(items, { filtered: true }).map((d) => d.date)).toEqual([
      "2026-08-10",
      "2026-08-14",
    ]);
  });
});

describe("the ribbon is continuous", () => {
  it("draws a cell for every day between the first and the last, not only the busy ones", () => {
    // §7.2 says continuous. A strip built only from the days that hold rows is
    // not a strip: one transaction drew one cell, which reads as a broken
    // control rather than as a quiet month, and the gap between two marks said
    // nothing about whether they were a day or a fortnight apart.
    const items = toLedgerItems([row("2026-09-01", "-10"), row("2026-09-05", "-20")], PLN);
    const days = ribbonDays(items);
    expect(days.map((day) => day.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("marks a filled day and leaves a quiet one bare", () => {
    const items = toLedgerItems([row("2026-09-01", "-10"), row("2026-09-03", "-20")], PLN);
    const byDate = new Map(ribbonDays(items).map((day) => [day.date as string, day]));
    expect(byDate.get("2026-09-02")?.activity).toBe("none");
    expect(byDate.get("2026-09-02")?.entries).toBe(0);
    expect(byDate.get("2026-09-03")?.activity).not.toBe("none");
  });

  it("draws one cell for a list that loaded one day", () => {
    const items = toLedgerItems([row("2026-09-01", "-10")], PLN);
    expect(ribbonDays(items).map((day) => day.date)).toEqual(["2026-09-01"]);
  });

  it("is empty for a list that loaded nothing", () => {
    expect(ribbonDays([])).toEqual([]);
  });
});

/**
 * **The anchor is always an item.** Both halves are read outward from it, so
 * the days between it and the nearest row on either side are known quiet —
 * and a screen named for a day must have that day on it. A cold open on a
 * quiet day used to draw a list and a ribbon that started two days earlier.
 */
describe("the anchor", () => {
  const anchor = accountingDate("2026-09-11");

  it("is drawn as a quiet day when nothing is on it, past the newest row", () => {
    const items = toLedgerItems([row("2026-09-09", "-10")], PLN, { anchor });
    expect(kinds(items)).toEqual(["quiet", "quiet", "day"]);
    expect(items[0]).toEqual({ kind: "quiet", from: anchor, to: anchor, days: 1 });
    // The day between is known quiet: the older half was read from the anchor.
    expect(items[1]).toEqual({ kind: "quiet", from: "2026-09-10", to: "2026-09-10", days: 1 });
  });

  it("is drawn as a quiet day past the oldest row, after a jump behind everything", () => {
    const items = toLedgerItems([row("2026-09-09", "-10")], PLN, {
      anchor: accountingDate("2026-09-06"),
    });
    expect(kinds(items)).toEqual(["day", "quiet", "quiet"]);
    expect(items[1]).toMatchObject({
      kind: "quiet",
      from: "2026-09-08",
      to: "2026-09-07",
      days: 2,
    });
    expect(items[2]).toEqual({ kind: "quiet", from: "2026-09-06", to: "2026-09-06", days: 1 });
  });

  it("splits a quiet run so the anchor is its own line inside it", () => {
    const items = toLedgerItems([row("2026-09-14", "-10"), row("2026-09-02", "-10")], PLN, {
      anchor: accountingDate("2026-09-08"),
    });
    expect(kinds(items)).toEqual(["day", "quiet", "quiet", "quiet", "day"]);
    expect(items[2]).toEqual({ kind: "quiet", from: "2026-09-08", to: "2026-09-08", days: 1 });
  });

  it("is nothing extra when a row already sits on it", () => {
    const items = toLedgerItems([row("2026-09-11", "-10")], PLN, { anchor });
    expect(kinds(items)).toEqual(["day"]);
  });

  it("is not drawn under a filter, which says nothing about days it did not match", () => {
    const items = toLedgerItems([row("2026-09-09", "-10")], PLN, { anchor, filtered: true });
    expect(kinds(items)).toEqual(["day"]);
  });

  it("gives the ribbon a cell, so the day the screen is named for is on it", () => {
    const strip = ribbonDays(toLedgerItems([row("2026-09-09", "-10")], PLN, { anchor }));
    expect(strip.map((day) => day.date)).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
    expect(strip[2]).toMatchObject({ activity: "none", entries: 0 });
  });

  it("is the whole ribbon when nothing at all is loaded yet", () => {
    const strip = ribbonDays(toLedgerItems([], PLN, { anchor }));
    expect(strip.map((day) => day.date)).toEqual([anchor]);
  });
});
