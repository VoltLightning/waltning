/**
 * The class-F folds, on rows written by hand so the expected figure can be
 * checked with a pencil. `computations.md` §2, §3, §7, §8 are the source of
 * every expected value here; the differential test in `packages/db` is where
 * the same fixture meets SQL.
 */

import { describe, expect, it } from "vitest";
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
  it("negates the cash flow on the leg that carries the counterparty", () => {
    const rows: money.DebtRow[] = [
      // lent 200 (expense, from leg): receivable +200
      { type: "expense", amountOriginal: m("200"), side: "from" },
      // repaid 50 as a transfer INTO my bank, counterparty on the `to` leg: −50
      { type: "transfer", amountOriginal: m("999"), toAmount: m("50"), side: "to" },
    ];
    expect(money.counterpartyBalance(rows)).toBe("150.00000000");
  });
});

describe("clearingBalance — §8", () => {
  it("is an ordinary account balance", () => {
    expect(money.clearingBalance).toBe(money.accountBalance);
  });
});
