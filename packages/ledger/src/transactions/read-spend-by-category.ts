/**
 * §6's `spend_by_category`, phone side — `money.spendByCategory` over the
 * two arrays the fold itself keeps separate: every expense transaction dated
 * within `period` (branch B's fallback, and the eligibility set branch A
 * checks lines against), and every one of their `transaction_lines` rows
 * (branch A). **Never a `LEFT JOIN`** — see `money.ts`'s own doc for why a
 * transaction with lines is queried through them exclusively.
 *
 * The transaction query filters `type = 'expense'` and the date range in SQL,
 * the same split `read-period-spend.ts` makes — scope stays a fold-side check
 * (`money.inScope`), not a `WHERE`, so the shape matches its sibling reader
 * exactly and one fold decides what *mine*, *shared* and *business* mean.
 *
 * **The line query is driven by the ids the first query already found**
 * (`inArray`), not by a second join back through `transactions`. The replica
 * indexes neither `transactions.date` nor `transaction_lines.transaction_id`,
 * so the join shape re-scanned `transactions` to re-derive a set this function
 * is already holding. One period's expenses is a list of tens, so the `IN` is
 * small and the second scan is gone.
 */

import * as money from "@waltning/core/money";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactionLines, transactions } = ledgerSchema;

export function readSpendByCategory<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  period: money.Period,
  scope: money.LedgerScope,
): readonly money.SpendByCategoryRow[] {
  const transactionRows = db
    .select({
      id: transactions.id,
      type: transactions.type,
      date: transactions.date,
      ownership: accounts.ownership,
      isBusiness: transactions.isBusiness,
      currency: transactions.currency,
      decimals: currencies.decimals,
      categoryId: transactions.categoryId,
      amountOriginal: transactions.amountOriginal,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, "expense"),
        gte(transactions.date, period.start),
        lt(transactions.date, period.end),
      ),
    )
    .all();

  const ids = transactionRows.map((row) => row.id);
  const lineRows =
    ids.length === 0
      ? []
      : db
          .select({
            transactionId: transactionLines.transactionId,
            categoryId: transactionLines.categoryId,
            amount: transactionLines.amount,
          })
          .from(transactionLines)
          .where(inArray(transactionLines.transactionId, ids))
          .all();

  return money.spendByCategory(transactionRows, lineRows, period, scope);
}
