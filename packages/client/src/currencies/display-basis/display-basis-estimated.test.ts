import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { createDisplayBasis } from "./display-basis.ts";

const EUR = money.currencyCode("EUR");
const PLN = money.currencyCode("PLN");
const D1 = accountingDate("2026-09-01");
const NO_RATE = accountingDate("2026-08-15");
const TODAY = accountingDate("2026-09-03");

/** EUR is the pivot. PLN is 4 per euro on the 1st and 4.5 today; the 15th of August has no quote. */
const RATES: Record<string, string> = { [`${PLN}@${D1}`]: "4", [`${PLN}@${TODAY}`]: "4.5" };

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

function withRebase(shown: ReturnType<typeof basis>): money.SpendByCategoryOptions {
  return shown.spendRebase === undefined ? {} : { rebase: shown.spendRebase };
}

const flow = (date: typeof D1, currency: money.CurrencyCode) => ({
  date,
  currency,
  decimals: 2,
  spend: money.toMoney("10"),
  inflow: money.ZERO,
  spendPivot: money.toMoney("10"),
  inflowPivot: money.ZERO,
});

describe("figures stated at a rate that is not their own date's are flagged (≈)", () => {
  it("flags a day with no rate of its own, and not one that had it", () => {
    const out = basis().rebaseFlows([flow(D1, EUR), flow(NO_RATE, EUR)]);
    expect(out[0]?.estimated).toBeUndefined();
    expect(out[1]?.estimated).toBe(true);
    expect(out[1]?.spendPivot).toBe(money.toMoney("45"));
  });

  it("a day already in the display currency needs no rate and is never flagged", () => {
    expect(basis().rebaseFlows([flow(NO_RATE, PLN)])[0]?.estimated).toBeUndefined();
  });

  it("flags a spend bucket that used a stand-in rate", () => {
    const row = (id: string, date: typeof D1) => ({
      id,
      type: "expense" as const,
      date,
      ownership: "own" as const,
      isBusiness: false,
      currency: EUR,
      decimals: 2,
      categoryId: "c1",
      amountOriginal: money.toMoney("10"),
      isCapital: false,
      fxRate: money.pivotPerUnit("1"),
    });
    const period = { start: accountingDate("2026-08-01"), end: accountingDate("2026-10-01") };
    const exact = money.spendByCategory([row("a", D1)], [], period, "mine", withRebase(basis()));
    const stood = money.spendByCategory(
      [row("a", D1), row("b", NO_RATE)],
      [],
      period,
      "mine",
      withRebase(basis()),
    );
    expect(exact[0]?.estimated).toBeUndefined();
    expect(stood[0]?.estimated).toBe(true);
  });

  it("states per date whether it is estimated", () => {
    expect(basis().estimatedAt(D1)).toBe(false);
    expect(basis().estimatedAt(NO_RATE)).toBe(true);
    expect(basis(EUR).estimatedAt(NO_RATE)).toBe(false);
  });
});
