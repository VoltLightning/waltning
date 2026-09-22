import { accountingDate } from "@waltning/core/date";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import {
  type LedgerDayRow,
  RIBBON_BACK_YEARS,
  ribbonCell,
  ribbonDate,
  ribbonDayOn,
  ribbonMarks,
  ribbonRun,
  toLedgerItems,
} from "./ledger-days.ts";

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
      ahead: false,
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
      ahead: false,
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
    expect(items[1]).toEqual({
      kind: "quiet",
      from: "2026-09-01",
      to: "2026-08-31",
      days: 2,
      ahead: false,
    });
  });

  it("returns nothing for no rows", () => {
    expect(toLedgerItems([], PLN)).toEqual([]);
  });
});

describe("ribbonMarks", () => {
  const day = (date: string, ...amounts: string[]) => amounts.map((a) => row(date, a));

  it("makes heavy relative to what is on screen, not to an absolute figure", () => {
    // A ledger whose largest day is 200 and one whose largest is 20 000 would
    // otherwise draw every mark the same size — the mark exists to say this
    // day was unusual for you.
    const items = toLedgerItems(
      [...day("2026-08-14", "-200"), ...day("2026-08-13", "-20"), ...day("2026-08-12", "-120")],
      PLN,
    );
    expect(ribbonMarks(items).days.map((d) => d.activity)).toEqual(["heavy", "some", "heavy"]);
  });

  it("calls a day that nets to zero with rows on it flat, never in or out", () => {
    // Transfers between your own accounts: money moved and none of it left.
    const items = toLedgerItems([...day("2026-08-14", "-100", "100")], PLN);
    expect(ribbonMarks(items).days[0]).toMatchObject({ direction: "flat", activity: "some" });
  });

  it("reads a positive day as in", () => {
    const items = toLedgerItems([...day("2026-08-14", "7850")], PLN);
    expect(ribbonMarks(items).days[0]).toMatchObject({ direction: "in" });
  });

  it("says something happened on a day it cannot price, and no more", () => {
    const items = toLedgerItems(
      [row("2026-08-14", "-50", { toAmount: toMoney("50"), toCurrency: EUR, toFxRate: null })],
      PLN,
    );
    expect(ribbonMarks(items).days[0]).toMatchObject({
      activity: "some",
      direction: "flat",
      pivot: null,
    });
  });

  it("counts the entries, so the label can say how many", () => {
    const items = toLedgerItems([...day("2026-08-14", "-10", "-20", "-30")], PLN);
    expect(ribbonMarks(items).days[0]?.entries).toBe(3);
  });

  it("runs earliest-first, whichever way the list it came from ran", () => {
    const items = toLedgerItems(
      [...day("2026-08-14", "-200"), ...day("2026-08-13", "-20"), ...day("2026-08-12", "-120")],
      PLN,
    );
    expect(items[0]).toMatchObject({ date: "2026-08-14" });
    expect(ribbonMarks(items).days.map((d) => d.date)).toEqual([
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
    expect(ribbonMarks(items, { filtered: true }).days.map((d) => d.date)).toEqual([
      "2026-08-10",
      "2026-08-14",
    ]);
  });
});

describe("a day of the strip, asked for when it is drawn", () => {
  const today = accountingDate("2026-09-10");

  it("is the loaded day where there is one", () => {
    const marks = ribbonMarks(toLedgerItems([row("2026-09-05", "-20")], PLN));
    expect(ribbonDayOn(accountingDate("2026-09-05"), marks, today)).toMatchObject({ entries: 1 });
  });

  it("is quiet between two loaded days, where a gap really is a gap in the ledger", () => {
    const marks = ribbonMarks(
      toLedgerItems([row("2026-09-05", "-20"), row("2026-09-01", "-10")], PLN),
    );
    expect(ribbonDayOn(accountingDate("2026-09-03"), marks, today)).toMatchObject({
      activity: "none",
      entries: 0,
    });
  });

  /**
   * **The one an endless strip makes necessary.** Most of its days are days
   * the list has never loaded, and `none` draws the quiet dot and reads
   * *"nothing"* — a claim about a day that may hold forty rows.
   */
  it("is unread outside what the list has loaded, on either side", () => {
    const marks = ribbonMarks(
      toLedgerItems([row("2026-09-05", "-20"), row("2026-09-01", "-10")], PLN),
    );
    for (const date of ["2026-08-31", "2019-02-03", "2026-09-06", "2026-09-10"]) {
      expect(ribbonDayOn(accountingDate(date), marks, today), date).toMatchObject({
        activity: "unread",
        pivot: null,
      });
    }
  });

  it("is invented past today, once the list reaches today", () => {
    const marks = ribbonMarks(toLedgerItems([row("2026-09-10", "-20")], PLN, { anchor: today }));
    expect(ribbonDayOn(accountingDate("2026-09-12"), marks, today)).toMatchObject({
      activity: "none",
      generated: true,
    });
  });

  it("is not invented after a jump to 2021, where the days after are unread", () => {
    // What sits past the last loaded day is five years of rows this page has
    // not read, not days nothing can have happened on.
    const anchor = accountingDate("2021-03-14");
    const marks = ribbonMarks(toLedgerItems([row("2021-03-14", "-10")], PLN, { anchor }), {
      anchor,
    });
    expect(ribbonDayOn(accountingDate("2026-09-12"), marks, today).generated).toBeUndefined();
    expect(ribbonDayOn(accountingDate("2021-03-15"), marks, today).activity).toBe("unread");
  });

  it("never calls a real row dated after today invented", () => {
    // The strip may drop invented cells to fit its band; a real row is a row.
    const marks = ribbonMarks(toLedgerItems([row("2026-09-20", "-10")], PLN, { anchor: today }), {
      anchor: today,
    });
    const real = ribbonDayOn(accountingDate("2026-09-20"), marks, today);
    expect(real.entries).toBe(1);
    expect(real.generated).toBeUndefined();
  });

  it("knows no span under a filter, where a gap says nothing about the ledger", () => {
    const marks = ribbonMarks(
      toLedgerItems([row("2026-09-05", "-20"), row("2026-09-01", "-10")], PLN, { filtered: true }),
      { filtered: true, anchor: today },
    );
    expect(marks.from).toBeUndefined();
    expect(marks.days.map((day) => day.date)).toEqual(["2026-09-01", "2026-09-05"]);
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
    expect(items[0]).toEqual({ kind: "quiet", from: anchor, to: anchor, days: 1, ahead: false });
    // The day between is known quiet: the older half was read from the anchor.
    expect(items[1]).toEqual({
      kind: "quiet",
      from: "2026-09-10",
      to: "2026-09-10",
      days: 1,
      ahead: false,
    });
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
    expect(items[2]).toEqual({
      kind: "quiet",
      from: "2026-09-06",
      to: "2026-09-06",
      days: 1,
      ahead: false,
    });
  });

  it("splits a quiet run so the anchor is its own line inside it", () => {
    const items = toLedgerItems([row("2026-09-14", "-10"), row("2026-09-02", "-10")], PLN, {
      anchor: accountingDate("2026-09-08"),
    });
    expect(kinds(items)).toEqual(["day", "quiet", "quiet", "quiet", "day"]);
    expect(items[2]).toEqual({
      kind: "quiet",
      from: "2026-09-08",
      to: "2026-09-08",
      days: 1,
      ahead: false,
    });
  });

  it("is nothing extra when a row already sits on it", () => {
    const items = toLedgerItems([row("2026-09-11", "-10")], PLN, { anchor });
    expect(kinds(items)).toEqual(["day"]);
  });

  it("is not drawn under a filter, which says nothing about days it did not match", () => {
    const items = toLedgerItems([row("2026-09-09", "-10")], PLN, { anchor, filtered: true });
    expect(kinds(items)).toEqual(["day"]);
  });

  it("is inside what the ribbon calls loaded, so the day the screen is named for is quiet, not unread", () => {
    const marks = ribbonMarks(toLedgerItems([row("2026-09-09", "-10")], PLN, { anchor }), {
      anchor,
    });
    expect(marks).toMatchObject({ from: "2026-09-09", to: anchor });
    expect(ribbonDayOn(anchor, marks, anchor)).toMatchObject({ activity: "none", entries: 0 });
  });

  /**
   * The page hands the *list* no anchor until both halves have answered, and
   * none at all over an empty ledger — the first-run state stands where the
   * rows would. The strip still names the day, from its own option.
   */
  it("is the whole of what is loaded when the list holds nothing", () => {
    const marks = ribbonMarks([], { anchor });
    expect(marks).toMatchObject({ from: anchor, to: anchor });
    expect(ribbonDayOn(anchor, marks, anchor)).toMatchObject({ activity: "none", entries: 0 });
  });
});

/**
 * **The strip has no end to meet, and no window to re-cut.** It was 45 days
 * either side of a centre that moved when the reader strayed from it: a thumb
 * met the end after six weeks, and every re-cut shifted every cell's index
 * under a strip in the middle of landing on one.
 */
describe("the strip's run", () => {
  const today = accountingDate("2026-09-21");

  it("starts on the 1 January of a decade, at least ten years back", () => {
    const run = ribbonRun(today);
    expect(run.origin).toBe("2010-01-01");
    expect(Number(run.origin.slice(0, 4))).toBeLessThanOrEqual(2026 - RIBBON_BACK_YEARS);
    expect(run.through).toBe(today);
    expect(ribbonDate(run.count - 1, run)).toBe(today);
  });

  /**
   * **Seen as a strip showing the same date a year earlier.** The origin was
   * the oldest loaded year less ten, so a jump from 2026 into 2025 moved every
   * cell's index by 365 under a strip that had just been left on a day.
   */
  it("does not move when the list loads an earlier year", () => {
    const before = ribbonRun(today, { oldest: accountingDate("2026-08-01") });
    const after = ribbonRun(today, { oldest: accountingDate("2025-10-17") });
    expect(after.origin).toBe(before.origin);
  });

  it("never moves forward again, once it has gone back", () => {
    const far = ribbonRun(today, { oldest: accountingDate("1950-06-01") });
    const home = ribbonRun(today, { oldest: accountingDate("2026-08-01"), floor: far.origin });
    expect(home.origin).toBe(far.origin);
  });

  it("makes a cell's index the days since the origin — nothing to clamp", () => {
    const run = ribbonRun(today);
    expect(ribbonCell(run.origin, run)).toBe(0);
    expect(ribbonCell(today, run)).toBe(run.count - 1);
    const cell = ribbonCell(accountingDate("2024-02-29"), run);
    expect(ribbonDate(cell, run)).toBe("2024-02-29");
  });

  it("does not move when an older page of the same year loads", () => {
    const before = ribbonRun(today, { oldest: accountingDate("2026-08-01") });
    const after = ribbonRun(today, { oldest: accountingDate("2026-02-11") });
    expect(after).toEqual(before);
  });

  it("reaches behind a jump to 1950, by whole years", () => {
    const run = ribbonRun(today, { oldest: accountingDate("1950-06-01") });
    expect(run.origin).toBe("1940-01-01");
    expect(run.origin < "1950-06-01").toBe(true);
    expect(ribbonCell(accountingDate("1950-06-01"), run)).toBeGreaterThan(0);
  });

  it("runs through a real day past today, and keeps counting past it", () => {
    const newest = accountingDate("2026-10-03");
    const run = ribbonRun(today, { newest });
    expect(run.through).toBe(newest);
    // The cells drawn to fill the band come after `through`, by arithmetic.
    expect(ribbonDate(run.count, run)).toBe("2026-10-04");
  });

  it("says a day before the origin has no cell", () => {
    expect(ribbonCell(accountingDate("1999-01-01"), ribbonRun(today))).toBe(-1);
  });
});

/**
 * **A day that has not happened is not a quiet day** (S04 §6). A list led past
 * today drew *4 days · nothing recorded* over three days that had not come
 * yet and the one that had: the run is split at today, and the part after it
 * is `ahead`.
 */
describe("days after today", () => {
  const today = accountingDate("2026-09-22");

  it("splits a quiet run that crosses today, and marks the part after it", () => {
    const items = toLedgerItems([row("2026-09-21", "-10")], PLN, {
      anchor: accountingDate("2026-09-26"),
      today,
    });
    expect(items.filter((item) => item.kind === "quiet")).toEqual([
      { kind: "quiet", from: "2026-09-26", to: "2026-09-26", days: 1, ahead: true },
      { kind: "quiet", from: "2026-09-25", to: "2026-09-23", days: 3, ahead: true },
      { kind: "quiet", from: "2026-09-22", to: "2026-09-22", days: 1, ahead: false },
    ]);
  });

  it("marks nothing ahead when the list ends at today", () => {
    const items = toLedgerItems([row("2026-09-19", "-10")], PLN, { anchor: today, today });
    expect(items.some((item) => item.kind === "quiet" && item.ahead)).toBe(false);
  });

  it("marks nothing ahead without a today to measure by", () => {
    const items = toLedgerItems([row("2026-09-21", "-10")], PLN, {
      anchor: accountingDate("2026-09-26"),
    });
    expect(items.some((item) => item.kind === "quiet" && item.ahead)).toBe(false);
  });
});
