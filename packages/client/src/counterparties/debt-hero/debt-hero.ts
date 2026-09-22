/**
 * S12 §3's hero figures: what you lent, what you owe, and the gap between
 * them — *what comes back to you*.
 *
 * **One fold, in the pivot, or none at all.** A headline built from lines the
 * replica holds no rate for would be a total with a hole in it, which is the
 * one thing a headline must not be (P1). An incomplete fold answers `null`
 * and the screen falls back to the per-currency card, which states each
 * currency on its own terms and claims nothing across them.
 *
 * **Here rather than in the screen** (`architecture/11`): money arithmetic
 * lives in `core/money` and the packages that compose it, never in an app —
 * a figure assembled beside a `View` is a figure no test reaches without
 * mounting one.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type {
  CounterpartyBalanceLine,
  CounterpartyRate,
} from "../counterparty-net/counterparty-net.ts";
import { counterpartyNet } from "../counterparty-net/counterparty-net.ts";

export type DebtHero = {
  /** Positive balances folded to the pivot — what is out with other people. */
  lent: Money;
  /** Negative balances, folded and made positive — what is yours to give back. */
  owed: Money;
  /**
   * `|lent − owed|` — a magnitude, never signed, because `direction` already
   * says which way it points. S12 §3: *"direction is stated in words, never
   * by sign alone"* (P5), and a hero reading *comes back to you −183,49* is
   * that rule broken on the screen it was written for.
   */
  net: Money;
  /** Which label the magnitude belongs under: what returns, or what you owe. */
  direction: "comes-back" | "you-owe";
  currency: CurrencyCode;
  decimals: number;
  /** The oldest rate either leg leant on, for a caller that wants to say so. */
  asOf: AccountingDate | null;
};

export function debtHero(
  lines: readonly CounterpartyBalanceLine[],
  pivot: CurrencyCode,
  rateOf: (currency: CurrencyCode) => CounterpartyRate | null,
  decimals: number,
): DebtHero | null {
  if (lines.length === 0) return null;

  const lent = counterpartyNet(
    lines.filter((line) => money.cmp(line.balance, money.ZERO) > 0),
    pivot,
    rateOf,
  );
  const owed = counterpartyNet(
    lines.filter((line) => money.cmp(line.balance, money.ZERO) < 0),
    pivot,
    rateOf,
  );
  if (!lent.complete || !owed.complete) return null;

  // `owed` folds negative balances and so is negative; the card states it as
  // a magnitude beside its own label, the way `MonthSummary` states spend.
  const owedPositive = money.abs(owed.value);
  const asOf =
    lent.asOf === null
      ? owed.asOf
      : owed.asOf === null
        ? lent.asOf
        : lent.asOf < owed.asOf
          ? lent.asOf
          : owed.asOf;

  const signedNet = money.sub(lent.value, owedPositive);

  return {
    lent: lent.value,
    owed: owedPositive,
    net: money.abs(signedNet),
    // Exactly settled points forward, not backwards: nothing comes back and
    // nothing is owed, and *you owe, on balance · 0,00* would name a debt
    // that does not exist.
    direction: money.cmp(signedNet, money.ZERO) < 0 ? "you-owe" : "comes-back",
    currency: pivot,
    decimals,
    asOf,
  };
}
