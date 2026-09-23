/**
 * S36's split — the figures a person reads before committing an allocation.
 *
 * **Computed once, here, and written as read.** S36 §6 puts the unallocated
 * remainder on screen throughout, because an allocation that does not sum is
 * the commonest way a clearing balance quietly stops meaning anything (J08
 * §5). A screen that shows one set of figures while the operation recomputes
 * another is that same failure with extra steps — so `allocate_shares` takes
 * amounts rather than weights, and this is where the amounts come from.
 *
 * **The payer is index 0, which is what makes §5's *remainder to the payer*
 * true rather than incidental.** `money.allocateLargestRemainder` hands the
 * leftover minor units to the largest remainders and breaks ties by order, so
 * an even split puts the extra grosz on whichever row comes first. Putting
 * yours there is a decision this module makes on the screen's behalf: 100,00
 * three ways is 33,34 / 33,33 / 33,33, and you are the one who covered it.
 *
 * **Here rather than in the screen** (`architecture/11`): every line of it is
 * money arithmetic, and a split assembled beside a `View` is a split no test
 * reaches without mounting one.
 */

import type { Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";

/** J08 §3's three modes. `custom` computes nothing — the amounts are typed. */
export type SplitMode = "even" | "shares" | "custom";

export type SplitSummary = {
  /** What the shares add up to. */
  allocated: Money;
  /**
   * The pot less what is allocated — S36 §3's *left to allocate*.
   *
   * Negative when the split hands out more than the pot holds, which
   * `allocate_shares` refuses: it would drive the balance past zero, where
   * the sign stops meaning "shares are missing" and starts meaning the
   * opposite (§6.4).
   */
  remaining: Money;
  /** Nothing left, at the currency's own scale — the split is complete. */
  complete: boolean;
  /** More allocated than the pot holds. Stated, and the commit is refused. */
  over: boolean;
};

/**
 * `total` split by weight, at the currency's scale, summing back to `total`
 * exactly.
 *
 * Never `total × (1/n)`: that leaves dust in the same direction every time,
 * and the clearing invariant would never clear again (`money.ts` §8's own
 * note on the same function).
 */
export function splitByWeight(
  total: Money,
  weights: readonly number[],
  decimals: number,
): readonly Money[] {
  if (weights.length === 0) return [];
  return money.allocateLargestRemainder(money.round(total, decimals), weights, decimals);
}

/** `splitByWeight` with every weight equal — J08's *Even*. */
export function splitEvenly(total: Money, count: number, decimals: number): readonly Money[] {
  if (count <= 0) return [];
  return splitByWeight(
    total,
    Array.from({ length: count }, () => 1),
    decimals,
  );
}

/**
 * What the screen states beneath the rows, in every mode including `custom`.
 *
 * **Rounded at the currency's own scale before it is compared to zero**, the
 * same rule `money.directionTotals` takes: a remainder of `0.004` renders as
 * `0,00` and must read as complete, or the screen withholds a commit over a
 * figure it is simultaneously drawing as nothing.
 */
export function splitSummary(
  pot: Money,
  amounts: readonly Money[],
  decimals: number,
): SplitSummary {
  const allocated = amounts.reduce((sum, amount) => money.add(sum, amount), money.ZERO as Money);
  const remaining = money.sub(pot, allocated);
  const sign = money.cmp(money.round(remaining, decimals), money.ZERO);
  return { allocated, remaining, complete: sign === 0, over: sign < 0 };
}
