/**
 * §12's `income_vs_expense`, phone side — `money.incomeVsExpense` over
 * income/expense transactions dated within the caller's own buckets, joined
 * to their account's ownership and their currency's decimals, the same shape
 * `read-period-spend.ts` already gives §5's base figure.
 *
 * **`buckets` is the caller's own partition of time**, never computed here —
 * the same reasoning `readPeriodSpend` gives for taking `period` as a
 * parameter rather than reading the device's clock. `money.trailingMonthBuckets`
 * is the one builder every caller today actually needs; it lives in
 * `packages/core` rather than here because the desk screen that also calls it
 * may never import `@waltning/ledger`.
 */

import * as money from "@waltning/core/money";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

export function readIncomeVsExpense<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  buckets: readonly money.IncomeExpenseBucket[],
  scope: money.LedgerScope,
): readonly money.IncomeExpenseRow[] {
  if (buckets.length === 0) return [];
  // `buckets` is caller-built and never overlaps (`trailingMonthBuckets`
  // above) — the first bucket's start and the last bucket's end bound the
  // whole span in one range read, and `money.incomeVsExpense` sorts each row
  // into its own bucket afterwards.
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (!first || !last) return [];

  const rows = db
    .select({
      type: transactions.type,
      date: transactions.date,
      ownership: accounts.ownership,
      isBusiness: transactions.isBusiness,
      currency: transactions.currency,
      decimals: currencies.decimals,
      amountOriginal: transactions.amountOriginal,
      isCapital: transactions.isCapital,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(
      and(
        isNull(transactions.deletedAt),
        inArray(transactions.type, ["income", "expense"]),
        gte(transactions.date, first.start),
        lt(transactions.date, last.end),
      ),
    )
    .all();

  return money.incomeVsExpense(rows, buckets, scope);
}
