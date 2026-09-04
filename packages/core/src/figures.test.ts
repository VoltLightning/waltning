/**
 * The class-F folds, on rows written by hand so the expected figure can be
 * checked with a pencil. `computations.md` §2, §3, §7, §8 are the source of
 * every expected value here; the differential test in `packages/db` is where
 * the same fixture meets SQL.
 */

import { describe, expect, it } from "vitest";
import { accountingDate } from "./date.ts";
import * as money from "./money.ts";

const m = (s: string) => money.toMoney(s);

describe("accountBalance — §2", () => {
  it("signs the source leg by type and adds the destination leg verbatim", () => {
    const rows: money.LegRow[] = [
      { type: "income", accountId: "a", amountOriginal: m("100") },
      { type: "expense", accountId: "a", amountOriginal: m("30.5") },
      { type: "adjustment", accountId: "a", amountOriginal: m("-2") },
      // a transfer OUT of a: source leg −40 on a
      {
        type: "transfer",
        accountId: "a",
        toAccountId: "b",
        amountOriginal: m("40"),
        toAmount: m("9.99"),
      },
      // a transfer INTO a: destination leg +12.34 on a (not the source amount)
      {
        type: "transfer",
        accountId: "b",
        toAccountId: "a",
        amountOriginal: m("55"),
        toAmount: m("12.34"),
      },
      // a row on another account entirely
      { type: "expense", accountId: "b", amountOriginal: m("999") },
    ];
    // 10 + 100 − 30.5 − 2 − 40 + 12.34 = 49.84
    expect(money.accountBalance(m("10"), "a", rows)).toBe("49.84000000");
  });

  it("is the opening balance when there are no rows — never NULL, never 0 losing the opening", () => {
    expect(money.accountBalance(m("5.5"), "a", [])).toBe("5.50000000");
  });
});

describe("netWorth — §3", () => {
  it("mine is own accounts only; ours is every account; business is in mine", () => {
    const balances: money.BalanceRow[] = [
      { ownership: "own", balance: m("100") },
      { ownership: "own", balance: m("-20") }, // a business account: still own, still mine
      { ownership: "shared", balance: m("50") },
    ];
    expect(money.netWorth(balances)).toEqual({ mine: "80.00000000", ours: "130.00000000" });
  });
});

describe("counterpartyBalance — §7", () => {
  const PLN = money.currencyCode("PLN");
  const EUR = money.currencyCode("EUR");

  it("negates the cash flow on the leg that carries the counterparty, split by currency", () => {
    const rows: money.DebtRow[] = [
      // lent 200 (expense, from leg): receivable +200, PLN
      { type: "expense", amountOriginal: m("200"), side: "from", currency: PLN },
      // repaid 50 as a transfer INTO my bank, counterparty on the `to` leg: −50, PLN
      { type: "transfer", amountOriginal: m("999"), toAmount: m("50"), side: "to", currency: PLN },
      // lent 50 in a DIFFERENT currency — §7 is balance(c, ccy): this must not
      // net against the PLN rows above into one combined figure.
      { type: "expense", amountOriginal: m("50"), side: "from", currency: EUR },
    ];
    expect(money.counterpartyBalance(rows)).toEqual([
      { currency: EUR, balance: "50.00000000" },
      { currency: PLN, balance: "150.00000000" },
    ]);
  });
});

describe("clearingBalance — §8", () => {
  it("is an ordinary account balance", () => {
    expect(money.clearingBalance).toBe(money.accountBalance);
  });
});

describe("periodSpend — §5 (base figure, C2)", () => {
  const PLN = money.currencyCode("PLN");
  const USD = money.currencyCode("USD");
  const period = { start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") };

  it("sums signed income/expense rows dated within the period, own accounts only", () => {
    const rows: money.PeriodTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("100"),
      },
      {
        type: "income",
        date: accountingDate("2026-08-10"),
        ownership: "own",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("30"),
      },
      // before the period — excluded
      {
        type: "expense",
        date: accountingDate("2026-07-31"),
        ownership: "own",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("999"),
      },
      // `end` is exclusive — the first of the next month is out
      {
        type: "expense",
        date: accountingDate("2026-09-01"),
        ownership: "own",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("999"),
      },
      // shared — excluded from this fold entirely, not netted (that is §5's S half)
      {
        type: "expense",
        date: accountingDate("2026-08-06"),
        ownership: "shared",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("50"),
      },
      // a transfer is neither income nor expense — excluded
      {
        type: "transfer",
        date: accountingDate("2026-08-07"),
        ownership: "own",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("20"),
      },
    ];
    expect(money.periodSpend(rows, period)).toEqual([
      { currency: PLN, decimals: 2, spend: "-100.00000000", net: "-70.00000000" },
    ]);
  });

  it("never sums two currencies into one row — the H21 mistake netWorth already refuses", () => {
    const rows: money.PeriodTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("100"),
      },
      {
        type: "expense",
        date: accountingDate("2026-08-06"),
        ownership: "own",
        currency: USD,
        decimals: 2,
        amountOriginal: m("40"),
      },
    ];
    expect(money.periodSpend(rows, period)).toEqual([
      { currency: PLN, decimals: 2, spend: "-100.00000000", net: "-100.00000000" },
      { currency: USD, decimals: 2, spend: "-40.00000000", net: "-40.00000000" },
    ]);
  });

  it("is empty over no rows", () => {
    expect(money.periodSpend([], period)).toEqual([]);
  });
});

describe("unsettledClearing — §8", () => {
  const PLN = money.currencyCode("PLN");

  it("keeps only the clearing accounts with a non-zero balance", () => {
    const balances: money.ClearingAccountRow[] = [
      { accountId: "a", name: "Shared clearing", currency: PLN, decimals: 2, balance: m("340") },
      { accountId: "b", name: "Settled clearing", currency: PLN, decimals: 2, balance: m("0") },
    ];
    expect(money.unsettledClearing(balances)).toEqual([
      {
        accountId: "a",
        name: "Shared clearing",
        currency: PLN,
        decimals: 2,
        balance: "340.00000000",
      },
    ]);
  });

  it("is empty when every clearing account nets to zero", () => {
    const balances: money.ClearingAccountRow[] = [
      { accountId: "a", name: "Shared clearing", currency: PLN, decimals: 2, balance: m("0") },
    ];
    expect(money.unsettledClearing(balances)).toEqual([]);
  });
});
