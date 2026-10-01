/**
 * The open debts the overview lists — one line per person per currency.
 *
 * **Never folded across currencies or people** (§6.6): *Nina, 5 EUR* and
 * *Nina, 20 PLN* are two lines, because there is no honest single number for
 * them and a rate that made one would be a guess presented as a balance.
 *
 * **Dust is not open.** A balance that rounds to zero at its own currency's
 * scale is settled (`money.debtDirection` compares at that scale), so it is
 * not a line — the same rule the register (S12) and the direction totals keep.
 *
 * Lines are the ones somebody owes you first, then the ones you owe, each
 * group by name — the order `debtTotalLines` already reads in.
 */

import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";

/** `listCounterpartyBalances`'s row, restated to what this reads (sibling domains never import each other). */
export type OpenDebtRow = {
  counterpartyId: string;
  name: string;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
};

export type OpenDebtLine = {
  key: string;
  counterpartyId: string;
  name: string;
  currency: CurrencyCode;
  decimals: number;
  /** A debt balance: positive means they owe you (§6.6). */
  balance: Money;
  direction: "theyOwe" | "youOwe";
};

export function openDebtLines(rows: readonly OpenDebtRow[]): readonly OpenDebtLine[] {
  const lines: OpenDebtLine[] = [];
  for (const row of rows) {
    const direction = money.debtDirection(row.balance, row.decimals);
    if (direction === "settled") continue;
    lines.push({
      key: `${row.counterpartyId}-${row.currency}`,
      counterpartyId: row.counterpartyId,
      name: row.name,
      currency: row.currency,
      decimals: row.decimals,
      balance: row.balance,
      direction,
    });
  }
  return lines.sort(
    (a, b) =>
      Number(a.direction === "youOwe") - Number(b.direction === "youOwe") ||
      a.name.localeCompare(b.name) ||
      a.currency.localeCompare(b.currency),
  );
}
