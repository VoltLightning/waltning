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
 * is already holding.
 *
 * **And it is chunked**, through the same `chunkIds` the counterparty merge
 * uses. `inArray` binds one SQLite variable per id and the default ceiling is
 * 999 — a typical month's expenses is a list of tens, but the period is the
 * caller's and a year, or an import's first month, is not. Unchunked, that
 * case throws `too many SQL variables` where it should have returned a chart:
 * a bound decided by how much you spend is not a bound.
 */

import * as money from "@waltning/core/money";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { chunkIds } from "../chunk-ids.ts";
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
  const lineRows = chunkIds(ids).flatMap((batch) =>
    db
      .select({
        transactionId: transactionLines.transactionId,
        categoryId: transactionLines.categoryId,
        amount: transactionLines.amount,
      })
      .from(transactionLines)
      .where(inArray(transactionLines.transactionId, batch))
      .all(),
  );

  return money.spendByCategory(transactionRows, lineRows, period, scope);
}
