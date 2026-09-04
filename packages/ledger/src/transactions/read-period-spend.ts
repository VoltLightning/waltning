/**
 * §5's base figure, phone side — `money.periodSpend` over income/expense
 * transactions dated within `period`, joined to their account's ownership
 * and their currency's decimals the way `readAccountsForNetWorth` (§3) and
 * `readRecent` already do. No shared-boundary netting (arc-full, needs
 * `to_amount_pivot` — see `money.ts`'s `periodSpend`).
 */

import * as money from "@waltning/core/money";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

export function readPeriodSpend<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  period: money.Period,
): readonly money.PeriodSpendRow[] {
  const rows = db
    .select({
      type: transactions.type,
      date: transactions.date,
      ownership: accounts.ownership,
      currency: transactions.currency,
      decimals: currencies.decimals,
      amountOriginal: transactions.amountOriginal,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(
      and(
        isNull(transactions.deletedAt),
        inArray(transactions.type, ["income", "expense"]),
        gte(transactions.date, period.start),
        lt(transactions.date, period.end),
      ),
    )
    .all();

  return money.periodSpend(rows, period);
}
