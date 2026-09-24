/**
 * `holdings` — what you hold, in the display currency, and what it is made of.
 *
 * S04's `HoldingsCard` states one figure and breaks it down two ways, and
 * `computations.md` §3 is the definition this folds: every account you own
 * that is counted — visible, left in the total, and with a rate to reach the
 * display currency — at today's rate, **loans apart**.
 *
 * **Loans are listed and not added.** Money lent out is not money you hold
 * (§6.6), and whether a payable belongs in the figure is an open question
 * (S04 §9); the card draws both under their own rule, so the total never has
 * to answer it. S16's register total is a different figure — every counted
 * account, loans included — and is labelled as such there.
 *
 * **An account with no rate is not guessed.** It leaves the total and the
 * count says so (`counted` of `of`), the register's own rule: a sum over nine
 * of ten accounts that says *nine of ten* is true, and one that folds in a
 * tenth at a rate nobody has is not.
 *
 * Pure: the rate is handed in (`rateOf`), so nothing here reads a ledger.
 */

import * as money from "@waltning/core/money";
import type { AccountColor, AccountKind } from "@waltning/core/registry/inputs";

export type HoldingsAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Picked by hand, or `null` for the kind's own — the card resolves it to ink. */
  color: AccountColor | null;
  currency: money.CurrencyCode;
  decimals: number;
  balance: money.Money;
  ownership: "own" | "shared";
  hidden: boolean;
  inTotal: boolean;
};

/** One kind's share — `value` in the display currency. */
export type HoldingsKind = { kind: AccountKind; count: number; value: money.Money };

/** One currency's share — its own `balance`, and `value` in the display currency. */
export type HoldingsCurrency = {
  currency: money.CurrencyCode;
  decimals: number;
  count: number;
  balance: money.Money;
  value: money.Money;
};

/** One counted account — its own `balance`, and `value` in the display currency. */
export type HoldingsAccountRow = {
  id: string;
  name: string;
  kind: AccountKind;
  color: AccountColor | null;
  currency: money.CurrencyCode;
  decimals: number;
  balance: money.Money;
  value: money.Money;
};

export type Holdings = {
  currency: money.CurrencyCode;
  decimals: number;
  /** What you hold: own, counted, not a loan. */
  mine: money.Money;
  /** `mine` plus shared accounts — `null` where no shared account is counted (§6.7). */
  ours: money.Money | null;
  /** The positive half of `mine`, and the negative half as a magnitude. */
  held: money.Money;
  owed: money.Money;
  /** Accounts in `mine`, of the own non-loan accounts that are visible. */
  counted: number;
  of: number;
  /** In first-seen order; the card orders kinds itself, as the register does. */
  byKind: readonly HoldingsKind[];
  byCurrency: readonly HoldingsCurrency[];
  /** Every account in `mine`, in the order handed in — the register's own. */
  byAccount: readonly HoldingsAccountRow[];
  /** Both loan kinds, own and counted, never in `mine`. */
  loans: readonly HoldingsKind[];
};

const LOANS: ReadonlySet<AccountKind> = new Set(["loan_receivable", "loan_payable"]);

export function isLoan(kind: AccountKind): boolean {
  return LOANS.has(kind);
}

/** One fold per key, in first-seen order — a `Map` keeps insertion order. */
function bump<K, V>(map: Map<K, V>, key: K, start: V, next: (running: V) => V): void {
  map.set(key, next(map.get(key) ?? start));
}

export function holdings(
  accounts: readonly HoldingsAccount[],
  display: { currency: money.CurrencyCode; decimals: number },
  rateOf: (currency: money.CurrencyCode) => money.PivotPerUnit | null,
): Holdings {
  /** The account in the display currency, or `null` where no rate reaches it. */
  const displayValueOf = (account: HoldingsAccount): money.Money | null => {
    if (account.currency === display.currency) return account.balance;
    const rate = rateOf(account.currency);
    return rate === null ? null : money.toPivot(account.balance, rate);
  };

  let mine = money.ZERO;
  let shared = money.ZERO;
  let anyShared = false;
  let held = money.ZERO;
  let owed = money.ZERO;
  let counted = 0;
  let of = 0;
  const byKind = new Map<AccountKind, HoldingsKind>();
  const byCurrency = new Map<money.CurrencyCode, HoldingsCurrency>();
  const loans = new Map<AccountKind, HoldingsKind>();
  const byAccount: HoldingsAccountRow[] = [];

  for (const account of accounts) {
    if (account.hidden) continue;
    const loan = isLoan(account.kind);
    if (account.ownership === "own" && !loan) of += 1;
    if (!account.inTotal) continue;
    const value = displayValueOf(account);
    if (value === null) continue;

    if (loan) {
      if (account.ownership !== "own") continue;
      bump(loans, account.kind, { kind: account.kind, count: 0, value: money.ZERO }, (row) => ({
        ...row,
        count: row.count + 1,
        value: money.add(row.value, value),
      }));
      continue;
    }

    if (account.ownership === "shared") {
      shared = money.add(shared, value);
      anyShared = true;
      continue;
    }

    counted += 1;
    mine = money.add(mine, value);
    byAccount.push({
      id: account.id,
      name: account.name,
      kind: account.kind,
      color: account.color,
      currency: account.currency,
      decimals: account.decimals,
      balance: account.balance,
      value,
    });
    if (money.isPositive(value)) held = money.add(held, value);
    else owed = money.add(owed, money.abs(value));
    bump(byKind, account.kind, { kind: account.kind, count: 0, value: money.ZERO }, (row) => ({
      ...row,
      count: row.count + 1,
      value: money.add(row.value, value),
    }));
    bump(
      byCurrency,
      account.currency,
      {
        currency: account.currency,
        decimals: account.decimals,
        count: 0,
        balance: money.ZERO,
        value: money.ZERO,
      },
      (row) => ({
        ...row,
        count: row.count + 1,
        balance: money.add(row.balance, account.balance),
        value: money.add(row.value, value),
      }),
    );
  }

  return {
    currency: display.currency,
    decimals: display.decimals,
    mine,
    ours: anyShared ? money.add(mine, shared) : null,
    held,
    owed,
    counted,
    of,
    byKind: [...byKind.values()],
    byCurrency: [...byCurrency.values()],
    byAccount,
    loans: [...loans.values()],
  };
}
