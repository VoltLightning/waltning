/**
 * What a repayment does to the debt it is for (`SPEC.md` §6.6, S14) — decided
 * once, before the write, so the capture surfaces say it and `settle_debt`
 * does it.
 *
 * **A repayment is `settle_debt`, never a second path.** *Repayment received*
 * and *Repayment made* name a person; if that person has an open debt **in the
 * matching direction**, the entry is a settlement: `settle_debt` reads the live
 * sign, stamps `debt_amount`/`debt_currency` (so 25 EUR can discharge a PLN
 * debt without opening a reverse EUR one), checks the direction, and reports
 * `overSettled`. This function is the part that can be known before the write:
 * which of the person's debts it pays, in which currency, for how much, and
 * what is left.
 *
 * - **No open debt in that direction** — `no-debt`. Not a silent new debt the
 *   other way round: if they never owed you, a repayment from them is a loan
 *   *to* you, which is what *Borrowed* says.
 * - **The debt is in a currency the account is not** — the discharge is the
 *   entered amount converted at the reference cross rate (`readCrossRate`, the
 *   same default S14 offers); without one, `no-rate`.
 * - **Over-settlement is stated, never clamped** (S14 §9.2): `over` is true
 *   when the repayment exceeds what was owed, and `residual` is what is left
 *   the other way.
 */

import type { CrossRate, CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { DebtIntent } from "../debt-intent/debt-intent.ts";

/** One open balance of the person, in one currency — `listCounterpartyBalances`'s row, restated. */
export type PersonBalance = {
  currency: CurrencyCode;
  decimals: number;
  /** Positive: they owe you (§6.6). */
  balance: Money;
};

export type RepaymentPlan =
  | { kind: "no-debt" }
  | { kind: "no-rate"; currency: CurrencyCode }
  | {
      kind: "settle";
      /** The debt it pays down. */
      currency: CurrencyCode;
      decimals: number;
      /** What it discharges, in `currency`. */
      dischargesAmount: Money;
      /** What is left after it, in `currency` (an estimate — the write derives the real one). */
      residual: Money;
      /** It pays more than was owed: the balance flips (S14 §9.2). */
      over: boolean;
    };

export type PlanRepaymentInput = {
  intent: DebtIntent | null;
  balances: readonly PersonBalance[];
  /** The account the money moves through — its currency is the entered amount's. */
  accountCurrency: CurrencyCode | null;
  /** The entered amount as a decimal string, in the account's currency; `null` while it is not a figure yet. */
  amount: string | null;
  /** The reference cross rate from a debt's currency to the account's — `readCrossRate`'s `rate`, or `null`. */
  crossRate: (from: CurrencyCode) => CrossRate | null;
};

/** `null` when the category is not a repayment at all; otherwise what the repayment does. */
export function planRepayment(input: PlanRepaymentInput): RepaymentPlan | null {
  if (input.intent === null || !input.intent.settles) return null;
  const wantPositive = input.intent.direction === "owed";
  const open = input.balances
    .filter((row) => {
      const direction = money.debtDirection(row.balance, row.decimals);
      return direction === (wantPositive ? "theyOwe" : "youOwe");
    })
    .sort(
      (a, b) =>
        Number(b.currency === input.accountCurrency) -
          Number(a.currency === input.accountCurrency) ||
        money.cmp(money.abs(b.balance), money.abs(a.balance)),
    );
  const debt = open[0];
  if (debt === undefined) return { kind: "no-debt" };
  if (input.amount === null || input.accountCurrency === null) {
    return {
      kind: "settle",
      currency: debt.currency,
      decimals: debt.decimals,
      dischargesAmount: money.ZERO,
      residual: debt.balance,
      over: false,
    };
  }
  const amount = money.toMoney(input.amount);
  let discharges: Money;
  if (debt.currency === input.accountCurrency) {
    discharges = amount;
  } else {
    const rate = input.crossRate(debt.currency);
    if (rate === null) return { kind: "no-rate", currency: debt.currency };
    discharges = money.round(money.toMoney(money.dec(amount).div(money.dec(rate))), debt.decimals);
  }
  const residual = wantPositive
    ? money.sub(debt.balance, discharges)
    : money.add(debt.balance, discharges);
  const sign = money.cmp(money.round(residual, debt.decimals), money.ZERO);
  const over = wantPositive ? sign < 0 : sign > 0;
  return {
    kind: "settle",
    currency: debt.currency,
    decimals: debt.decimals,
    dischargesAmount: discharges,
    residual,
    over,
  };
}
