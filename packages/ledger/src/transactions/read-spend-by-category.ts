/**
 * §6's `spend_by_category`, phone side — `money.spendByCategory` over the
 * two arrays the fold itself keeps separate: every expense transaction dated
 * within `period` (branch B's fallback, and the eligibility set branch A
 * checks lines against), and every one of their `transaction_lines` rows
 * (branch A). **Never a `LEFT JOIN`** — see `money.ts`'s own doc for why a
 * transaction with lines is queried through them exclusively.
 *
 * Both queries filter `type = 'expense'` and the date range in SQL, the same
 * split `read-period-spend.ts` makes — ownership stays a fold-side check
 * (`row.ownership !== "own"`), not a `WHERE`, so the shape matches its
 * sibling reader exactly.
 */

import * as money from "@waltning/core/money";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactionLines, transactions } = ledgerSchema;

export function readSpendByCategory<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  period: money.Period,
): readonly money.SpendByCategoryRow[] {
  const dateInPeriod = and(
    isNull(transactions.deletedAt),
    eq(transactions.type, "expense"),
    gte(transactions.date, period.start),
    lt(transactions.date, period.end),
  );

  const transactionRows = db
    .select({
      id: transactions.id,
      type: transactions.type,
      date: transactions.date,
      ownership: accounts.ownership,
      currency: transactions.currency,
      decimals: currencies.decimals,
      categoryId: transactions.categoryId,
      amountOriginal: transactions.amountOriginal,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(dateInPeriod)
    .all();

  const lineRows = db
    .select({
      transactionId: transactionLines.transactionId,
      categoryId: transactionLines.categoryId,
      amount: transactionLines.amount,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .where(dateInPeriod)
    .all();

  return money.spendByCategory(transactionRows, lineRows, period);
}
