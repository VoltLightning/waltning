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
      { currency: PLN, decimals: 2, spend: "100.00000000", net: "-70.00000000" },
    ]);
  });

  /**
   * §5: `spend(p, s) = Σ amount_pivot over expense rows` — the stored,
   * positive amount, not `signed()`'s negated one. §12 defines `spent` as
   * exactly this figure. `net` is still `inflow − spend`, so a spend-only
   * month is negative net without `spend` itself carrying the sign.
   */
  it("spend is the positive magnitude — §12's `spent`, not a signed delta", () => {
    const rows: money.PeriodTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        currency: PLN,
        decimals: 2,
        amountOriginal: m("100"),
      },
    ];
    const [row] = money.periodSpend(rows, period);
    expect(row?.spend).toBe("100.00000000");
    expect(money.dec(row?.spend ?? "0").isNegative()).toBe(false);
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
      { currency: PLN, decimals: 2, spend: "100.00000000", net: "-100.00000000" },
      { currency: USD, decimals: 2, spend: "40.00000000", net: "-40.00000000" },
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

describe("fifoOldestOpen — §7 ageing and §8 attribution", () => {
  const d = accountingDate;

  it("lend 200, repay 200 → nothing unconsumed", () => {
    const rows: money.FifoDelta<string>[] = [
      { id: "lend", date: d("2026-08-01"), delta: m("200") },
      { id: "repay", date: d("2026-08-10"), delta: m("-200") },
    ];
    expect(money.fifoOldestOpen(rows)).toBeNull();
  });

  it("lend 200, lend 300, repay 200 → the 300's row, not the 200's", () => {
    const rows: money.FifoDelta<string>[] = [
      { id: "lend200", date: d("2026-08-01"), delta: m("200") },
      { id: "lend300", date: d("2026-08-02"), delta: m("300") },
      { id: "repay200", date: d("2026-08-03"), delta: m("-200") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({ id: "lend300", date: d("2026-08-02") });
  });

  it("consumes the oldest open row first, in date order rather than list order", () => {
    const rows: money.FifoDelta<string>[] = [
      { id: "second", date: d("2026-08-02"), delta: m("100") },
      { id: "first", date: d("2026-08-01"), delta: m("100") },
      { id: "consume", date: d("2026-08-03"), delta: m("-100") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({ id: "second", date: d("2026-08-02") });
  });

  it("§8's own reading: inflows open, outflows consume, FIFO", () => {
    // Two inflows to a clearing account, one allocation out — the shared
    // plan's decision on what J08's group bill looks like on the ledger.
    const rows: money.FifoDelta<string>[] = [
      { id: "inflow1", date: d("2026-08-01"), delta: m("120") },
      { id: "inflow2", date: d("2026-08-05"), delta: m("80") },
      { id: "allocation", date: d("2026-08-06"), delta: m("-120") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({ id: "inflow2", date: d("2026-08-05") });
  });

  it("is null over no rows", () => {
    expect(money.fifoOldestOpen([])).toBeNull();
  });

  it("tracks the RUNNING direction, not the final balance's sign — crosses zero twice", () => {
    // +50, −80, +100, +20, −75, dates 1..5. The final balance is +15, but
    // classifying every row against that final sign (the bug) picks the
    // +100 row as oldest-open. Walking the running direction instead: +50
    // opens; −80 drains it (50) then opens a NEW row of the opposite sign
    // for the excess (30); +100 drains that 30 then opens a new +70; +20
    // opens alongside it (same sign, queue now +70/+20); −75 drains the +70
    // fully then 5 of the +20, leaving the +20 row's remainder at 15 — the
    // oldest surviving row is the +20 one, not the +100 one.
    const rows: money.FifoDelta<string>[] = [
      { id: "d1", date: d("2026-08-01"), delta: m("50") },
      { id: "d2", date: d("2026-08-02"), delta: m("-80") },
      { id: "d3", date: d("2026-08-03"), delta: m("100") },
      { id: "d4", date: d("2026-08-04"), delta: m("20") },
      { id: "d5", date: d("2026-08-05"), delta: m("-75") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({ id: "d4", date: d("2026-08-04") });

    // The remainders left open sum to exactly the balance (15).
    const total = rows.reduce((acc, r) => acc.plus(money.dec(r.delta)), money.dec(0));
    expect(money.toMoney(total)).toBe("15.00000000");
  });
});

describe("ageBucket — §7", () => {
  it("buckets 0-30 / 31-60 / 61-90 / 90+ at the edges", () => {
    expect(money.ageBucket(0)).toBe("0-30");
    expect(money.ageBucket(30)).toBe("0-30");
    expect(money.ageBucket(31)).toBe("31-60");
    expect(money.ageBucket(60)).toBe("31-60");
    expect(money.ageBucket(61)).toBe("61-90");
    expect(money.ageBucket(90)).toBe("61-90");
    expect(money.ageBucket(91)).toBe("90+");
  });
});

describe("ageInDays — §7", () => {
  it("counts whole calendar days, never through Date arithmetic on a clock", () => {
    expect(money.ageInDays(accountingDate("2026-08-01"), accountingDate("2026-08-31"))).toBe(30);
    expect(money.ageInDays(accountingDate("2026-08-01"), accountingDate("2026-08-01"))).toBe(0);
  });
});

describe("directionTotals — S12", () => {
  const PLN = money.currencyCode("PLN");
  const EUR = money.currencyCode("EUR");

  it("sums positives into theyOwe and the magnitude of negatives into youOwe, per currency", () => {
    const rows: money.DirectionTotalInputRow[] = [
      { currency: PLN, balance: m("200"), decimals: 2 }, // Nina owes 200 PLN
      { currency: PLN, balance: m("-50"), decimals: 2 }, // you owe Marek 50 PLN
      { currency: EUR, balance: m("-30"), decimals: 2 }, // you owe Nina 30 EUR
    ];
    expect(money.directionTotals(rows)).toEqual([
      { currency: EUR, theyOwe: "0.00000000", youOwe: "30.00000000", decimals: 2 },
      { currency: PLN, theyOwe: "200.00000000", youOwe: "50.00000000", decimals: 2 },
    ]);
  });

  it("never nets two people's balances in the same currency against each other", () => {
    // 200 owed to you and 200 you owe, same currency, different people —
    // theyOwe and youOwe both carry the full figure, not a netted zero.
    const rows: money.DirectionTotalInputRow[] = [
      { currency: PLN, balance: m("200"), decimals: 2 },
      { currency: PLN, balance: m("-200"), decimals: 2 },
    ];
    expect(money.directionTotals(rows)).toEqual([
      { currency: PLN, theyOwe: "200.00000000", youOwe: "200.00000000", decimals: 2 },
    ]);
  });

  it("is empty over no rows", () => {
    expect(money.directionTotals([])).toEqual([]);
  });

  it("omits a currency whose balances net to exactly zero — a settled counterparty's row", () => {
    const rows: money.DirectionTotalInputRow[] = [
      { currency: PLN, balance: m("0"), decimals: 2 }, // fully settled — theyOwe and youOwe both stay zero
      { currency: EUR, balance: m("30"), decimals: 2 },
    ];
    expect(money.directionTotals(rows)).toEqual([
      { currency: EUR, theyOwe: "30.00000000", youOwe: "0.00000000", decimals: 2 },
    ]);
  });

  /** H2 — sub-minor-unit dust rounds to zero at the currency's own scale, so the currency is omitted. */
  it("omits a currency whose balances net to dust that rounds to zero at its own scale", () => {
    const rows: money.DirectionTotalInputRow[] = [
      { currency: PLN, balance: m("0.00000001"), decimals: 2 },
      { currency: PLN, balance: m("-0.00000001"), decimals: 2 },
    ];
    expect(money.directionTotals(rows)).toEqual([]);
  });
});

describe("allocateLargestRemainder — §8, J08 §5", () => {
  it("185.00 three equal ways: 61.67 / 61.67 / 61.66, summing exactly", () => {
    const shares = money.allocateLargestRemainder(m("185.00"), [1, 1, 1], 2);
    expect(shares).toEqual(["61.67000000", "61.67000000", "61.66000000"]);
    expect(money.sum([...shares])).toBe("185.00000000");
  });

  it("100.00 three equal ways: 33.34 / 33.33 / 33.33 (J08 §5)", () => {
    const shares = money.allocateLargestRemainder(m("100.00"), [1, 1, 1], 2);
    expect(shares).toEqual(["33.34000000", "33.33000000", "33.33000000"]);
    expect(money.sum([...shares])).toBe("100.00000000");
  });

  it("weighted 2:1:1 still sums exactly", () => {
    const shares = money.allocateLargestRemainder(m("100.00"), [2, 1, 1], 2);
    expect(money.sum([...shares])).toBe("100.00000000");
    expect(money.dec(shares[0] ?? "0").gte(shares[1] ?? "0")).toBe(true);
  });

  it("never total × (1/n) — the three-way split is not a single repeated figure", () => {
    const shares = money.allocateLargestRemainder(m("10.00"), [1, 1, 1], 2);
    expect(new Set(shares).size).toBeGreaterThan(1);
  });

  it("is empty over no weights", () => {
    expect(money.allocateLargestRemainder(m("10"), [], 2)).toEqual([]);
  });

  it("refuses a negative total by name, rather than clamping the leftover to zero", () => {
    // A `Math.max(0, …)` clamp on the leftover unit count silently drops a
    // unit instead of handing it out — 3-way split of −100.00 summed to
    // −99.99. Refuse it outright and name the total in the error.
    expect(() => money.allocateLargestRemainder(m("-100.00"), [1, 1, 1], 2)).toThrow(
      /-100.00000000/,
    );
  });
});
