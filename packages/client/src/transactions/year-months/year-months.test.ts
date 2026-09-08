import { accountingDate, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { busiestMonth, yearMonths } from "./year-months.ts";

const PLN = "PLN" as money.CurrencyCode;
const USD = "USD" as money.CurrencyCode;
const TODAY = yearMonth("2026-09");

function flow(date: string, over: Partial<money.DayFlowRow> = {}): money.DayFlowRow {
  return {
    date: accountingDate(date),
    currency: PLN,
    decimals: 2,
    spend: money.ZERO,
    inflow: money.ZERO,
    ...over,
  };
}

describe("yearMonths", () => {
  it("gives twelve rows, empty months included", () => {
    // A year is twelve months whether or not you spent in all of them, and a
    // list that skipped the empty ones would change length as the ledger fills.
    const rows = yearMonths([], 2026, PLN, TODAY);
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.month)).toContain("2026-02");
  });

  it("folds a month's days into one figure", () => {
    const rows = yearMonths(
      [
        flow("2026-03-04", { spend: money.toMoney("30") }),
        flow("2026-03-20", { spend: money.toMoney("12.50") }),
        flow("2026-03-21", { inflow: money.toMoney("100") }),
      ],
      2026,
      PLN,
      TODAY,
    );
    const march = rows.find((row) => row.month === "2026-03");
    expect(march?.spend).toEqual(money.toMoney("42.50"));
    expect(march?.inflow).toEqual(money.toMoney("100"));
    expect(march?.net).toEqual(money.toMoney("57.50"));
  });

  it("keeps a second currency out of the figures and says it was there", () => {
    // Arc-phone has no display-currency conversion, so summing PLN and USD
    // would be inventing a number. Dropping it silently would be worse.
    const rows = yearMonths(
      [
        flow("2026-03-04", { spend: money.toMoney("30") }),
        flow("2026-03-05", { currency: USD, spend: money.toMoney("7") }),
      ],
      2026,
      PLN,
      TODAY,
    );
    const march = rows.find((row) => row.month === "2026-03");
    expect(march?.spend).toEqual(money.toMoney("30"));
    expect(march?.otherCurrencies).toBe(1);
  });

  it("counts each other currency once, however many days it appeared on", () => {
    const rows = yearMonths(
      [
        flow("2026-03-04", { currency: USD, spend: money.toMoney("7") }),
        flow("2026-03-05", { currency: USD, spend: money.toMoney("9") }),
      ],
      2026,
      PLN,
      TODAY,
    );
    expect(rows.find((row) => row.month === "2026-03")?.otherCurrencies).toBe(1);
  });

  it("marks the months after the one the ledger has reached", () => {
    const rows = yearMonths([], 2026, PLN, TODAY);
    expect(rows.find((row) => row.month === "2026-09")?.ahead).toBe(false);
    expect(rows.find((row) => row.month === "2026-10")?.ahead).toBe(true);
  });
});

describe("busiestMonth", () => {
  it("measures the larger of income and spend, never the net", () => {
    // A month that took 8 000 and spent 8 000 nets to nothing and is not a
    // quiet month. Scaling by the net would draw it as one.
    const rows = yearMonths(
      [
        flow("2026-03-04", { inflow: money.toMoney("8000"), spend: money.toMoney("8000") }),
        flow("2026-04-04", { spend: money.toMoney("500") }),
      ],
      2026,
      PLN,
      TODAY,
    );
    expect(busiestMonth(rows)).toEqual(money.toMoney("8000"));
  });

  it("is zero for a year with nothing in it, rather than throwing", () => {
    expect(busiestMonth(yearMonths([], 2026, PLN, TODAY))).toEqual(money.ZERO);
  });
});
