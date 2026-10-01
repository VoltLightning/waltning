import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { createDisplayBasis } from "./display-basis.ts";

const EUR = money.currencyCode("EUR");
const PLN = money.currencyCode("PLN");
const USD = money.currencyCode("USD");
const D1 = accountingDate("2026-09-01");
const D2 = accountingDate("2026-09-02");
const TODAY = accountingDate("2026-09-03");

/** EUR is the pivot. PLN is 4 per euro on the 1st and 5 on the 2nd; nothing for USD. */
const RATES: Record<string, string> = {
  [`${PLN}@${D1}`]: "4",
  [`${PLN}@${D2}`]: "5",
  [`${PLN}@${TODAY}`]: "4.5",
};

function basis(display = PLN) {
  return createDisplayBasis({
    pivot: { code: EUR, decimals: 2 },
    display: { code: display, decimals: 2 },
    readRate: (quote, date) => {
      const found = RATES[`${quote}@${date}`];
      return found === undefined ? null : { rate: money.unitsPerPivot(found), asOf: date };
    },
    today: TODAY,
  });
}

describe("createDisplayBasis", () => {
  it("is the identity when the display currency is the pivot", () => {
    const same = basis(EUR);
    expect(same.identity).toBe(true);
    const flows = [] as const;
    expect(same.rebaseFlows(flows)).toBe(flows);
    expect(same.spendRebase).toBeUndefined();
  });

  it("restates a pivot figure at the rate of its own date, never one rate for all", () => {
    const pln = basis();
    expect(money.toMoney(pln.fromPivotAt(money.toMoney("10"), D1))).toBe(money.toMoney("40"));
    expect(money.toMoney(pln.fromPivotAt(money.toMoney("10"), D2))).toBe(money.toMoney("50"));
  });

  it("a date with no rate of its own is stated at today's, and says it is estimated", () => {
    const pln = basis();
    const rows = pln.rebaseRows([
      {
        date: accountingDate("2026-08-15"),
        currency: EUR,
        fxRate: money.pivotPerUnit("1"),
        fxRateEstimated: false,
        toCurrency: null,
        toFxRate: null,
      },
    ]);
    expect(rows[0]?.fxRate).toBe(money.pivotPerUnit("4.5"));
    expect(rows[0]?.fxRateEstimated).toBe(true);
  });

  it("a row already in the display currency is its own figure, not a round trip", () => {
    const pln = basis();
    const rows = pln.rebaseRows([
      {
        date: D1,
        currency: PLN,
        fxRate: money.pivotPerUnit("0.2500"),
        fxRateEstimated: false,
        toCurrency: null,
        toFxRate: null,
      },
    ]);
    expect(rows[0]?.fxRate).toBe(money.pivotPerUnit("1"));
  });

  it("restates day flows per day, keeps a display-currency day native, and voids an unpriced one", () => {
    const pln = basis();
    const flow = (
      date: typeof D1,
      currency: money.CurrencyCode,
      spend: string,
      inPivot: string | null,
    ) => ({
      date,
      currency,
      decimals: 2,
      spend: money.toMoney(spend),
      inflow: money.ZERO,
      spendPivot: inPivot === null ? null : money.toMoney(inPivot),
      inflowPivot: inPivot === null ? null : money.ZERO,
    });
    const out = pln.rebaseFlows([
      flow(D1, EUR, "10", "10"),
      flow(D2, EUR, "10", "10"),
      flow(D1, PLN, "7", "1.75"),
      flow(D1, USD, "3", null),
    ]);
    expect(out[0]?.spendPivot).toBe(money.toMoney("40"));
    expect(out[1]?.spendPivot).toBe(money.toMoney("50"));
    expect(out[2]?.spendPivot).toBe(money.toMoney("7"));
    expect(out[3]?.spendPivot).toBeNull();
  });

  it("states units of another currency per display unit, through the pivot", () => {
    const pln = basis();
    // 1 PLN = 1/4 EUR on the 1st; the pivot itself is 1.
    expect(pln.unitsPerDisplay(EUR, D1)).toBe(money.unitsPerPivot("0.25"));
    expect(pln.unitsPerDisplay(USD, D1)).toBeNull();
    expect(pln.readFromDisplay(EUR, D1)?.asOf).toBe(D1);
  });
});

function withRebase(shown: ReturnType<typeof basis>): money.SpendByCategoryOptions {
  return shown.spendRebase === undefined ? {} : { rebase: shown.spendRebase };
}

describe("spendByCategory's rebase", () => {
  const row = (id: string, date: typeof D1, currency: money.CurrencyCode, amount: string) => ({
    id,
    type: "expense" as const,
    date,
    ownership: "own" as const,
    isBusiness: false,
    currency,
    decimals: 2,
    categoryId: "c1",
    amountOriginal: money.toMoney(amount),
    isCapital: false,
    fxRate: money.pivotPerUnit("1"),
  });
  const period = { start: accountingDate("2026-09-01"), end: accountingDate("2026-10-01") };

  it("converts each transaction at its own date's rate, then sums", () => {
    const pln = basis();
    const rows = money.spendByCategory(
      [row("a", D1, EUR, "10"), row("b", D2, EUR, "10")],
      [],
      period,
      "mine",
      withRebase(pln),
    );
    // 10 x 4 + 10 x 5, not 20 at either rate.
    expect(rows[0]?.amountPivot).toBe(money.toMoney("90"));
  });

  it("states a bucket in the display currency as itself", () => {
    const pln = basis();
    const rows = money.spendByCategory(
      [row("a", D1, PLN, "7")],
      [],
      period,
      "mine",
      withRebase(pln),
    );
    expect(rows[0]?.amountPivot).toBe(money.toMoney("7"));
  });
});
