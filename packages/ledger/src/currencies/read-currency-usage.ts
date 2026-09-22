/**
 * `readCurrencyUsage` — what each currency actually holds.
 *
 * **S17's row count, and the one fact that decides whether a currency can be
 * removed at all.** §6: a currency with rows can only be hidden, and one with
 * neither rows nor rates can be removed outright — so a screen that offers
 * *remove* without this is guessing, and the drawing's own banner (*SEK has
 * no rates and no rows*) cannot be written without it.
 *
 * **Accounts count as rows.** An account denominated in a currency is a claim
 * on it even before a single transaction exists — removing the currency under
 * it would leave a balance in something the ledger no longer knows. Counted
 * separately so a screen can say which of the two is holding it.
 *
 * Two aggregates rather than rows: a currency held by four hundred
 * transactions answers the same question as one held by four, and reading
 * four hundred rows to learn "some" is a query that grows with the ledger.
 */

import type { CurrencyCode } from "@waltning/core/money";
import { count, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, transactions } = ledgerSchema;

export type LocalCurrencyUsage = {
  /** Transactions denominated in it — soft-deleted rows excluded (§6.9). */
  transactions: number;
  /** Accounts denominated in it, archived ones included: an archived account still holds a balance. */
  accounts: number;
};

export function readCurrencyUsage<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): ReadonlyMap<CurrencyCode, LocalCurrencyUsage> {
  const usage = new Map<CurrencyCode, LocalCurrencyUsage>();

  const bump = (code: CurrencyCode, field: keyof LocalCurrencyUsage, rows: number) => {
    const current = usage.get(code) ?? { transactions: 0, accounts: 0 };
    usage.set(code, { ...current, [field]: rows });
  };

  for (const row of db
    .select({ currency: transactions.currency, rows: count() })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .groupBy(transactions.currency)
    .all()) {
    bump(row.currency, "transactions", row.rows);
  }

  for (const row of db
    .select({ currency: accounts.currency, rows: count() })
    .from(accounts)
    .groupBy(accounts.currency)
    .all()) {
    bump(row.currency, "accounts", row.rows);
  }

  return usage;
}
