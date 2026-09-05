/**
 * The class-F folds, on rows written by hand so the expected figure can be
 * checked with a pencil. `computations.md` §2, §3, §7, §8 are the source of
 * every expected value here; the differential test in `packages/db` is where
 * the same fixture meets SQL.
 */

import { describe, expect, it } from "vitest";
import { accountingDate, yearMonth } from "./date.ts";
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
    expect(money.fifoOldestOpen(rows)).toEqual({
      id: "lend300",
      date: d("2026-08-02"),
      remainder: "300.00000000",
    });
  });

  it("consumes the oldest open row first, in date order rather than list order", () => {
    const rows: money.FifoDelta<string>[] = [
      { id: "second", date: d("2026-08-02"), delta: m("100") },
      { id: "first", date: d("2026-08-01"), delta: m("100") },
      { id: "consume", date: d("2026-08-03"), delta: m("-100") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({
      id: "second",
      date: d("2026-08-02"),
      remainder: "100.00000000",
    });
  });

  it("§8's own reading: inflows open, outflows consume, FIFO", () => {
    // Two inflows to a clearing account, one allocation out — the shared
    // plan's decision on what J08's group bill looks like on the ledger.
    const rows: money.FifoDelta<string>[] = [
      { id: "inflow1", date: d("2026-08-01"), delta: m("120") },
      { id: "inflow2", date: d("2026-08-05"), delta: m("80") },
      { id: "allocation", date: d("2026-08-06"), delta: m("-120") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({
      id: "inflow2",
      date: d("2026-08-05"),
      remainder: "80.00000000",
    });
  });

  it("is null over no rows", () => {
    expect(money.fifoOldestOpen([])).toBeNull();
  });

  /**
   * H1 — the remainder is signed like the queue's own running direction, not
   * always positive. A single −150 outflow (a clearing account whose one leg
   * is a payment out, e.g. Hotel) opens a negative-sign entry — `abs()`ing it
   * used to render "150,00 PLN unallocated" beside a "−150,00 account
   * balance" that disagreed with it.
   */
  it("a lone negative leg keeps its sign in the remainder (H1)", () => {
    const rows: money.FifoDelta<string>[] = [
      { id: "hotel", date: d("2026-08-01"), delta: m("-150") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({
      id: "hotel",
      date: d("2026-08-01"),
      remainder: "-150.00000000",
    });
  });

  /**
   * H2 — a clearing/counterparty opening balance is seeded as a delta with
   * `id: null` so it folds into FIFO like any other row but can never be
   * "named" the way a real transaction can. Opening 100, one 40 expense:
   * balance 60, and the opening entry — not the expense — is what is still
   * open, since the expense is a consuming row, not an opening one.
   */
  it("names the opening entry (id null) when it is the oldest still-open row", () => {
    const rows: money.FifoDelta<string>[] = [
      { id: null, date: d("2026-08-01"), delta: m("100") },
      { id: "expense", date: d("2026-08-10"), delta: m("-40") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({
      id: null,
      date: d("2026-08-01"),
      remainder: "60.00000000",
    });
  });

  /**
   * L2 — the opening entry sorts by its own date like any other; it is not
   * pinned to "always oldest." A leg dated before `openingDate` (an import
   * backdated past the account's own recorded start) sorts ahead of it.
   */
  it("sorts a leg dated before openingDate ahead of the opening entry itself", () => {
    const rows: money.FifoDelta<string>[] = [
      { id: null, date: d("2026-08-10"), delta: m("100") },
      { id: "backdated", date: d("2026-08-01"), delta: m("50") },
    ];
    expect(money.fifoOldestOpen(rows)).toEqual({
      id: "backdated",
      date: d("2026-08-01"),
      remainder: "50.00000000",
    });
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
    expect(money.fifoOldestOpen(rows)).toEqual({
      id: "d4",
      date: d("2026-08-04"),
      remainder: "15.00000000",
    });

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

  /**
   * H4 — a total carrying more precision than `decimals` (a caller that
   * forgot to round first) silently floored away sub-minor-unit digits
   * instead of raising: refuse it by name, naming both the total and the
   * scale it disagrees with.
   */
  it("refuses a total that is not integral at the given scale", () => {
    expect(() => money.allocateLargestRemainder(m("10.005"), [1, 1, 1], 2)).toThrow(
      /10.00500000.*2 decimals/,
    );
  });
});

describe("spendByCategory — §6 (DESK4)", () => {
  const PLN = money.currencyCode("PLN");
  const USD = money.currencyCode("USD");
  const period = { start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") };
  const GROCERIES = "cat-groceries";
  const DINING = "cat-dining";
  const TRANSPORT = "cat-transport";
  const DISCOUNT = "cat-discount";

  it("attributes a plain expense row to its own category", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t1",
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("100"),
      },
    ];
    expect(money.spendByCategory(rows, [], period, "mine")).toEqual([
      { currency: PLN, decimals: 2, categoryId: GROCERIES, amount: "100.00000000" },
    ]);
  });

  /**
   * The exact trap §6 names: "a `LEFT JOIN` with a coalesced amount — a
   * transaction with four lines would contribute its own amount four times."
   * A four-line dinner split three ways plus a home-supplies line, on a
   * transaction whose own `categoryId` is `null` (a split carries no category
   * of its own) — the total across every returned row must equal the
   * transaction's own amount exactly once, not 4×, and the parent's own
   * (absent) category must never also appear as a fifth row.
   */
  it("counts a four-line transaction once — never through the parent's own category too", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t-split",
        type: "expense",
        date: accountingDate("2026-08-12"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: null,
        amountOriginal: m("100"),
      },
    ];
    const lines: money.SpendByCategoryLineRow[] = [
      { transactionId: "t-split", categoryId: DINING, amount: m("25") },
      { transactionId: "t-split", categoryId: DINING, amount: m("25") },
      { transactionId: "t-split", categoryId: GROCERIES, amount: m("30") },
      { transactionId: "t-split", categoryId: TRANSPORT, amount: m("20") },
    ];
    const result = money.spendByCategory(rows, lines, period, "mine");
    const total = result.reduce((sum, row) => money.add(sum, row.amount), money.ZERO);
    expect(total).toBe("100.00000000");
    expect(result).toEqual([
      { currency: PLN, decimals: 2, categoryId: DINING, amount: "50.00000000" },
      { currency: PLN, decimals: 2, categoryId: GROCERIES, amount: "30.00000000" },
      { currency: PLN, decimals: 2, categoryId: TRANSPORT, amount: "20.00000000" },
    ]);
  });

  it("a transaction WITH lines never also credits its own categoryId — the LEFT JOIN defect, named directly", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t-mixed",
        type: "expense",
        date: accountingDate("2026-08-12"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        // A stale/leftover category on the parent row itself — must be
        // ignored entirely once lines exist, or the LEFT JOIN defect
        // reappears as a fifth, phantom row.
        categoryId: GROCERIES,
        amountOriginal: m("40"),
      },
    ];
    const lines: money.SpendByCategoryLineRow[] = [
      { transactionId: "t-mixed", categoryId: DINING, amount: m("40") },
    ];
    expect(money.spendByCategory(rows, lines, period, "mine")).toEqual([
      { currency: PLN, decimals: 2, categoryId: DINING, amount: "40.00000000" },
    ]);
  });

  it("a null-category line still forms its own row — an uncategorized split is not dropped", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t-uncat",
        type: "expense",
        date: accountingDate("2026-08-12"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: null,
        amountOriginal: m("15"),
      },
    ];
    const lines: money.SpendByCategoryLineRow[] = [
      { transactionId: "t-uncat", categoryId: null, amount: m("15") },
    ];
    expect(money.spendByCategory(rows, lines, period, "mine")).toEqual([
      { currency: PLN, decimals: 2, categoryId: null, amount: "15.00000000" },
    ]);
  });

  it("excludes income, transfers, shared accounts, and rows outside the period", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "income",
        type: "income",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("500"),
      },
      {
        id: "transfer",
        type: "transfer",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: null,
        amountOriginal: m("500"),
      },
      {
        id: "shared",
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "shared",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("500"),
      },
      {
        id: "out-of-period",
        type: "expense",
        date: accountingDate("2026-07-31"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("500"),
      },
    ];
    expect(money.spendByCategory(rows, [], period, "mine")).toEqual([]);
  });

  it("never sums two currencies into one row", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t-pln",
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("100"),
      },
      {
        id: "t-usd",
        type: "expense",
        date: accountingDate("2026-08-06"),
        ownership: "own",
        isBusiness: false,
        currency: USD,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("40"),
      },
    ];
    expect(money.spendByCategory(rows, [], period, "mine")).toEqual([
      { currency: PLN, decimals: 2, categoryId: GROCERIES, amount: "100.00000000" },
      { currency: USD, decimals: 2, categoryId: GROCERIES, amount: "40.00000000" },
    ]);
  });

  it("is empty over no rows", () => {
    expect(money.spendByCategory([], [], period, "mine")).toEqual([]);
  });

  /**
   * L3 — the half-open period's **exclusive** end. Every earlier case pinned
   * the inclusive start (a 31 July row is out of an August period); nothing
   * asked whether 1 September was out of it, which is the boundary a `<=`
   * would break and a `<` holds.
   */
  it("excludes a row dated on the period's own end — the range is half-open", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t-end",
        type: "expense",
        date: accountingDate("2026-09-01"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("100"),
      },
    ];
    expect(money.spendByCategory(rows, [], period, "mine")).toEqual([]);
  });

  /**
   * L2 — `transaction_lines.amount` has no positivity CHECK, only
   * `transaction_lines_sum_matches`, so a legal split can carry a discount
   * line. The fold reports the negative bucket as a fact rather than
   * absorbing it: the categories that were charged keep their own figures,
   * and the sum is still the transaction's own amount exactly once.
   */
  it("reports a negative line as its own bucket, never folded into the others", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t-discount",
        type: "expense",
        date: accountingDate("2026-08-12"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: null,
        amountOriginal: m("100"),
      },
    ];
    const lines: money.SpendByCategoryLineRow[] = [
      { transactionId: "t-discount", categoryId: GROCERIES, amount: m("60") },
      { transactionId: "t-discount", categoryId: DINING, amount: m("50") },
      { transactionId: "t-discount", categoryId: TRANSPORT, amount: m("20") },
      { transactionId: "t-discount", categoryId: DISCOUNT, amount: m("-30") },
    ];
    const result = money.spendByCategory(rows, lines, period, "mine");
    expect(result.reduce((sum, row) => money.add(sum, row.amount), money.ZERO)).toBe(
      "100.00000000",
    );
    expect(result.find((row) => row.categoryId === DISCOUNT)?.amount).toBe("-30.00000000");
    expect(result.find((row) => row.categoryId === GROCERIES)?.amount).toBe("60.00000000");
  });

  /** The scope segment, all four values, over one own/shared/business fixture. */
  it("answers each scope over the same rows", () => {
    const rows: money.SpendByCategoryTransactionRow[] = [
      {
        id: "t-own",
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: GROCERIES,
        amountOriginal: m("10"),
      },
      {
        id: "t-business",
        type: "expense",
        date: accountingDate("2026-08-06"),
        ownership: "own",
        isBusiness: true,
        currency: PLN,
        decimals: 2,
        categoryId: DINING,
        amountOriginal: m("20"),
      },
      {
        id: "t-shared",
        type: "expense",
        date: accountingDate("2026-08-07"),
        ownership: "shared",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        categoryId: TRANSPORT,
        amountOriginal: m("40"),
      },
    ];
    const totalOf = (scope: money.LedgerScope) =>
      money
        .spendByCategory(rows, [], period, scope)
        .reduce((sum, row) => money.add(sum, row.amount), money.ZERO);

    expect(totalOf("all")).toBe("70.00000000");
    expect(totalOf("mine")).toBe("30.00000000");
    expect(totalOf("shared")).toBe("40.00000000");
    expect(totalOf("business")).toBe("20.00000000");
  });
});

describe("incomeVsExpense — §12 (DESK4)", () => {
  const PLN = money.currencyCode("PLN");
  const USD = money.currencyCode("USD");
  const buckets: money.IncomeExpenseBucket[] = [
    { label: "2026-07", start: accountingDate("2026-07-01"), end: accountingDate("2026-08-01") },
    { label: "2026-08", start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") },
  ];

  it("sums income and expense magnitudes per bucket", () => {
    const rows: money.IncomeExpenseTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("100"),
        isCapital: false,
      },
      {
        type: "income",
        date: accountingDate("2026-08-10"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("30"),
        isCapital: false,
      },
      {
        type: "expense",
        date: accountingDate("2026-07-15"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("60"),
        isCapital: false,
      },
    ];
    expect(money.incomeVsExpense(rows, buckets, "mine")).toEqual([
      {
        label: "2026-07",
        currency: PLN,
        decimals: 2,
        income: "0.00000000",
        expense: "60.00000000",
      },
      {
        label: "2026-08",
        currency: PLN,
        decimals: 2,
        income: "30.00000000",
        expense: "100.00000000",
      },
    ]);
  });

  it("excludes capital rows — §5's comparison rule, stated inline by omission here", () => {
    const rows: money.IncomeExpenseTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("100000"),
        isCapital: true,
      },
      {
        type: "expense",
        date: accountingDate("2026-08-06"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("50"),
        isCapital: false,
      },
    ];
    // Two buckets in, two buckets out: July holds nothing but is still a
    // month, and a chart that drew one bar under a two-month header would be
    // reporting a gap it had no way to show. See "fills every bucket" below.
    expect(money.incomeVsExpense(rows, buckets, "mine")).toEqual([
      {
        label: "2026-07",
        currency: PLN,
        decimals: 2,
        income: "0.00000000",
        expense: "0.00000000",
      },
      {
        label: "2026-08",
        currency: PLN,
        decimals: 2,
        income: "0.00000000",
        expense: "50.00000000",
      },
    ]);
  });

  it("excludes transfers and shared accounts, and drops a row outside every bucket", () => {
    const rows: money.IncomeExpenseTransactionRow[] = [
      {
        type: "transfer",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("500"),
        isCapital: false,
      },
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "shared",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("500"),
        isCapital: false,
      },
      {
        type: "expense",
        date: accountingDate("2026-06-01"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("500"),
        isCapital: false,
      },
    ];
    expect(money.incomeVsExpense(rows, buckets, "mine")).toEqual([]);
  });

  it("never sums two currencies into one row, within a bucket", () => {
    const rows: money.IncomeExpenseTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("100"),
        isCapital: false,
      },
      {
        type: "expense",
        date: accountingDate("2026-08-06"),
        ownership: "own",
        isBusiness: false,
        currency: USD,
        decimals: 2,
        amountOriginal: m("40"),
        isCapital: false,
      },
    ];
    expect(money.incomeVsExpense(rows, buckets, "mine")).toEqual([
      { label: "2026-07", currency: PLN, decimals: 2, income: "0.00000000", expense: "0.00000000" },
      { label: "2026-07", currency: USD, decimals: 2, income: "0.00000000", expense: "0.00000000" },
      {
        label: "2026-08",
        currency: PLN,
        decimals: 2,
        income: "0.00000000",
        expense: "100.00000000",
      },
      {
        label: "2026-08",
        currency: USD,
        decimals: 2,
        income: "0.00000000",
        expense: "40.00000000",
      },
    ]);
  });

  it("is empty over no rows", () => {
    expect(money.incomeVsExpense([], buckets, "mine")).toEqual([]);
  });

  /**
   * M1 — the empty bucket. Built from matched rows alone, a six-month chart
   * with activity in three months drew three bars: the gap was invisible and
   * the spacing lied about where the months were.
   */
  it("fills every bucket, for every currency the range holds", () => {
    const rows: money.IncomeExpenseTransactionRow[] = [
      {
        type: "income",
        date: accountingDate("2026-08-10"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("30"),
        isCapital: false,
      },
    ];
    expect(money.incomeVsExpense(rows, buckets, "mine").map((row) => row.label)).toEqual([
      "2026-07",
      "2026-08",
    ]);
  });

  /** L3 — the exclusive end, the flow fold's own half of the boundary case. */
  it("excludes a row dated on the last bucket's own end", () => {
    const rows: money.IncomeExpenseTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-09-01"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("100"),
        isCapital: false,
      },
    ];
    expect(money.incomeVsExpense(rows, buckets, "mine")).toEqual([]);
  });

  it("answers each scope over the same rows", () => {
    const rows: money.IncomeExpenseTransactionRow[] = [
      {
        type: "expense",
        date: accountingDate("2026-08-05"),
        ownership: "own",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("10"),
        isCapital: false,
      },
      {
        type: "expense",
        date: accountingDate("2026-08-06"),
        ownership: "own",
        isBusiness: true,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("20"),
        isCapital: false,
      },
      {
        type: "expense",
        date: accountingDate("2026-08-07"),
        ownership: "shared",
        isBusiness: false,
        currency: PLN,
        decimals: 2,
        amountOriginal: m("40"),
        isCapital: false,
      },
    ];
    const augustExpense = (scope: money.LedgerScope) =>
      money.incomeVsExpense(rows, buckets, scope).find((row) => row.label === "2026-08")?.expense;

    expect(augustExpense("all")).toBe("70.00000000");
    expect(augustExpense("mine")).toBe("30.00000000");
    expect(augustExpense("shared")).toBe("40.00000000");
    expect(augustExpense("business")).toBe("20.00000000");
  });
});

describe("trailingMonthBuckets — DESK4", () => {
  it("builds the trailing N calendar months ending at (and including) endMonth, oldest first", () => {
    expect(money.trailingMonthBuckets(yearMonth("2026-08"), 3)).toEqual([
      { label: "2026-06", start: accountingDate("2026-06-01"), end: accountingDate("2026-07-01") },
      { label: "2026-07", start: accountingDate("2026-07-01"), end: accountingDate("2026-08-01") },
      { label: "2026-08", start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") },
    ]);
  });

  it("crosses a year boundary", () => {
    expect(money.trailingMonthBuckets(yearMonth("2026-01"), 2)).toEqual([
      { label: "2025-12", start: accountingDate("2025-12-01"), end: accountingDate("2026-01-01") },
      { label: "2026-01", start: accountingDate("2026-01-01"), end: accountingDate("2026-02-01") },
    ]);
  });

  it("is empty over zero months", () => {
    expect(money.trailingMonthBuckets(yearMonth("2026-08"), 0)).toEqual([]);
  });
});

describe("topByAmount — §7.2 (DESK4)", () => {
  type Row = { key: string; amount: money.Money };
  const row = (key: string, amount: string): Row => ({ key, amount: m(amount) });

  it("keeps the top n by amount descending and sums the rest", () => {
    const rows = [row("a", "10"), row("b", "50"), row("c", "30"), row("d", "5"), row("e", "20")];
    const { top, restTotal } = money.topByAmount(rows, 3);
    expect(top.map((r) => r.key)).toEqual(["b", "c", "e"]);
    expect(restTotal).toBe("15.00000000"); // 10 + 5
  });

  it("restTotal is zero when there is nothing past the top n", () => {
    const rows = [row("a", "10"), row("b", "20")];
    const { top, restTotal } = money.topByAmount(rows, 5);
    expect(top.map((r) => r.key)).toEqual(["b", "a"]);
    expect(restTotal).toBe("0.00000000");
  });

  it("is empty over no rows", () => {
    expect(money.topByAmount([], 5)).toEqual({ top: [], restTotal: "0.00000000" });
  });
});
