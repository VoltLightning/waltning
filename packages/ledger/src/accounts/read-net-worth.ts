/**
 * §3 net worth, per currency. No display currency exists on the phone yet and
 * no rate to sum across, so this is one `{mine, ours}` pair per currency held —
 * the same call `CurrencyTotals` makes on the Today screen, and for the same
 * reason: inventing a rate here is H21 with nothing to check it against.
 */

import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { ReplicaDb } from "../open.ts";
import type { ledgerSchema } from "../schema-map.ts";
import { readAccountsForNetWorth } from "./read-accounts.ts";

export type LocalNetWorth = { currency: CurrencyCode; decimals: number; mine: Money; ours: Money };

export function readNetWorth<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalNetWorth[] {
  const byCurrency = new Map<CurrencyCode, { decimals: number; rows: money.BalanceRow[] }>();
  for (const account of readAccountsForNetWorth(db)) {
    const bucket = byCurrency.get(account.currency) ?? { decimals: account.decimals, rows: [] };
    bucket.rows.push({ ownership: account.ownership, balance: account.balance });
    byCurrency.set(account.currency, bucket);
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, { decimals, rows }]) => ({ currency, decimals, ...money.netWorth(rows) }));
}
