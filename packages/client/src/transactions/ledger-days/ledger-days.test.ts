import { accountingDate } from "@waltning/core/date";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { type LedgerDayRow, toLedgerItems } from "./ledger-days.ts";

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
