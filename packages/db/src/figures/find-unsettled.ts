/**
 * §8's `find_unsettled`, server side. Balance is class **F**; naming the
 * oldest unconsumed transaction is a closed-form read of the same FIFO rule
 * `money.fifoOldestOpen` walks stepwise on the phone (`packages/core/src/money.ts`),
 * proven equal to it by `differential.test.ts`.
 *
 * **The closed form.** Classify each of a clearing account's own legs as
 * *opening* (same sign as the account's final balance) or *consuming* (the
 * opposite sign) — §8's own reading: "inflows opened, outflows consume,
 * FIFO," for the ordinary case where the balance is a positive unallocated
 * amount. Sum every consuming leg's magnitude into `total_consumed`; sum the
 * opening legs' magnitudes as a running total in `(date, id)` order. The
 * first opening leg whose running total **exceeds** `total_consumed` is the
 * oldest one still carrying a positive remainder — exactly `fifoOldestOpen`'s
 * answer, because FIFO consumption always draws from the oldest opens first
 * and (in a well-formed ledger) never outruns what has opened by the time it
 * runs.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Money } from "@waltning/core/money";
import { getTableName, sql } from "drizzle-orm";
import type { DbHandle } from "../client.ts";
import { accounts, transactions } from "../schema.ts";
import { signedFromLeg } from "./signed.sql.ts";

export type FindUnsettledRow = {
  accountId: string;
  balance: Money;
  oldestUnconsumedTransactionId: string;
  oldestDate: AccountingDate;
};

/** The raw driver row — snake_case, string dates — before this module's own mapping. */
type RawRow = {
  account_id: string;
  balance: string;
  oldest_unconsumed_transaction_id: string;
  oldest_date: string;
};

const accountsTable = sql.raw(`"${getTableName(accounts)}"`);
const transactionsTable = sql.raw(`"${getTableName(transactions)}"`);

export async function findUnsettled(db: DbHandle): Promise<readonly FindUnsettledRow[]> {
  const query = sql`
    WITH legs AS (
      SELECT
        ${accounts.id} AS account_id,
        ${transactions.id} AS transaction_id,
        ${transactions.date} AS date,
        CASE WHEN ${transactions.accountId} = ${accounts.id}
          THEN ${signedFromLeg}
          ELSE ${transactions.toAmount}
        END AS delta
      FROM ${accountsTable}
      JOIN ${transactionsTable}
        ON (${transactions.accountId} = ${accounts.id} OR ${transactions.toAccountId} = ${accounts.id})
       AND ${transactions.deletedAt} IS NULL
      WHERE ${accounts.kind} = 'clearing'
    ),
    balances AS (
      SELECT account_id, sum(delta) AS balance FROM legs GROUP BY account_id
    ),
    signed_legs AS (
      SELECT l.account_id, l.transaction_id, l.date, l.delta, b.balance, sign(b.balance) AS final_sign
      FROM legs l JOIN balances b USING (account_id)
      WHERE b.balance <> 0
    ),
    consumed AS (
      SELECT account_id, sum(abs(delta)) AS total_consumed
      FROM signed_legs
      WHERE delta <> 0 AND sign(delta) <> final_sign
      GROUP BY account_id
    ),
    opens AS (
      SELECT account_id, transaction_id, date, delta,
        sum(abs(delta)) OVER (PARTITION BY account_id ORDER BY date, transaction_id) AS running_open
      FROM signed_legs
      WHERE delta <> 0 AND sign(delta) = final_sign
    )
    SELECT DISTINCT ON (o.account_id)
      o.account_id AS account_id,
      b.balance::numeric(20,8)::text AS balance,
      o.transaction_id AS oldest_unconsumed_transaction_id,
      o.date AS oldest_date
    FROM opens o
    JOIN balances b USING (account_id)
    LEFT JOIN consumed c USING (account_id)
    WHERE o.running_open > coalesce(c.total_consumed, 0)
    ORDER BY o.account_id, o.date, o.transaction_id
  `;

  // A CTE with a window function has no fixed result shape for drizzle's
  // query builder to infer — `db.execute<TRow>` is the documented escape
  // hatch for exactly this, with the row shape pinned as a type parameter
  // rather than a widen-and-cast pair: `RawRow` is checked against
  // `differential.test.ts`'s fixture rather than trusted blind.
  const result = await db.execute<RawRow>(query);
  return [...result].map((row) => ({
    accountId: row.account_id,
    balance: row.balance as Money,
    oldestUnconsumedTransactionId: row.oldest_unconsumed_transaction_id,
    oldestDate: row.oldest_date as AccountingDate,
  }));
}
