/**
 * S12 §3's per-currency totals, as the lines the card actually draws.
 *
 * **A direction with nothing in it is not a line.** `money.directionTotals`
 * already drops a currency both directions are settled in (H2), but a
 * currency owed in one direction only still carries a `0` in the other, and
 * *you owe · EUR 0,00* is a sentence that states nothing under a card whose
 * whole job is to state figures. Same reasoning one level down: the rule that
 * drops the empty currency drops the empty half of a currency too.
 *
 * **They-owe lines first, then you-owe.** The card reads as two groups, not
 * as a currency-major table — you scan *what is out with people* in one
 * block, and the grouping is what makes that possible. Ordering is this
 * function's answer, so a test can hold it; interleaved by currency was the
 * shape nobody chose.
 *
 * **Here rather than in the screen** (`architecture/11`): deciding a figure is
 * zero is reading money, and a `money.isZero` beside a `View` is a decision no
 * test reaches without mounting one.
 */

import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";

export type DebtTotalLine = {
  /** Stable across renders — a currency holds at most one line per direction. */
  key: string;
  currency: CurrencyCode;
  decimals: number;
  direction: "they-owe" | "you-owe";
  /** A magnitude; `direction` is what says which way it points (P5). */
  value: Money;
};

export function debtTotalLines(rows: readonly money.DirectionTotalRow[]): readonly DebtTotalLine[] {
  const theyOwe = rows
    .filter((row) => !money.isZero(money.round(row.theyOwe, row.decimals)))
    .map(
      (row): DebtTotalLine => ({
        key: `${row.currency}-they-owe`,
        currency: row.currency,
        decimals: row.decimals,
        direction: "they-owe",
        value: row.theyOwe,
      }),
    );
  const youOwe = rows
    .filter((row) => !money.isZero(money.round(row.youOwe, row.decimals)))
    .map(
      (row): DebtTotalLine => ({
        key: `${row.currency}-you-owe`,
        currency: row.currency,
        decimals: row.decimals,
        direction: "you-owe",
        value: row.youOwe,
      }),
    );
  return [...theyOwe, ...youOwe];
}
