/**
 * One currency's balance across a set of accounts — `SharedGroup` and
 * `AccountRegister`'s own kind-group headers both fold the exact same shape
 * (a currency, an optional decimals, a balance) and had two copies of this
 * before this file existed.
 */

import * as money from "@waltning/core/money";

export type SubtotalRow = { currency: string; decimals?: number; balance: money.Money };
export type Subtotal = { currency: string; decimals: number; balance: money.Money };

/** `money.add` over one pass — a currency's first account sets its own `decimals`. */
export function subtotalsOf(rows: readonly SubtotalRow[]): readonly Subtotal[] {
  const byCurrency = new Map<string, Subtotal>();
  for (const row of rows) {
    const decimals = row.decimals ?? 2;
    const running = byCurrency.get(row.currency);
    byCurrency.set(
      row.currency,
      running === undefined
        ? { currency: row.currency, decimals, balance: row.balance }
        : { ...running, balance: money.add(running.balance, row.balance) },
    );
  }
  return [...byCurrency.values()];
}
