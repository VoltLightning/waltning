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
 *
 * **This closed form holds even once the balance crosses zero more than
 * once** — a review of this PR suspected it shared `money.ts`'s
 * running-direction bug (fixed there: classifying every leg against the
 * *final* balance's sign, rather than tracking the queue's own live
 * direction, discarded a reversal's excess instead of reopening it). It does
 * not: a reversal that fully drains the queue and reopens with excess is,
 * from this query's point of view, indistinguishable from that excess simply
 * being a smaller "opening" leg dated later — because `total_consumed` sums
 * *every* opposite-sign leg regardless of what it drained, the arithmetic
 * cancels out to the same running-open/consumed threshold either way.
 * Verified two ways: 500,000 random multi-flip series fuzzed against a
 * literal queue simulation (both in the PR description and, formally, by
 * `differential.test.ts`'s "Flip clearing" fixture — `+50, −80, +100, +20,
 * −75` — where this file's *unmodified* query already names the `+20` leg,
 * matching `money.fifoOldestOpen` once fixed).
 *
 * **The opening balance (C1, H2).** Two omissions previously fell out of the
 * same missing piece: `balances` summed `legs` alone, so an account's
 * `opening_balance` never counted, and one with a non-zero opening but no
 * legs at all did not appear here even though `money.accountBalance` (the
 * phone's own copy) gave it one — the exact figure the two engines exist to
 * agree on. `opening` below is a one-row-per-clearing-account CTE precisely
 * so `balances` can `LEFT JOIN` it: an account absent from `legs` still
 * produces a row, on its opening balance alone. `fifo_legs` seeds the same
 * opening balance into the FIFO queue as its own entry — `transaction_id`
 * `NULL`, dated `opening_date` — the SQL twin of the synthetic delta
 * `read-unsettled-clearing.ts` pushes on the phone; `NULLS FIRST` on every
 * ordering that touches `transaction_id` matches `money.fifoOldestOpen`'s own
 * tie-break, which sorts a `null` id before any real one at the same date.
 * An account with no `opening_date` recorded falls back to `0001-01-01` —
 * "already there before anything else was" — the same sentinel
 * `read-unsettled-clearing.ts` uses.
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
  /** `null` when the oldest unconsumed entry is the account's own opening balance, not a transaction (H2) — the SQL twin of `read-unsettled-clearing.ts`'s same field. */
  oldestUnconsumedTransactionId: string | null;
  oldestDate: AccountingDate;
};

/** The raw driver row — snake_case, string dates — before this module's own mapping. */
type RawRow = {
  account_id: string;
  balance: string;
  oldest_unconsumed_transaction_id: string | null;
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
    opening AS (
      SELECT ${accounts.id} AS account_id,
        ${accounts.openingBalance} AS opening_balance,
        coalesce(${accounts.openingDate}, '0001-01-01') AS opening_date
      FROM ${accountsTable}
      WHERE ${accounts.kind} = 'clearing'
    ),
    balances AS (
      SELECT o.account_id, (o.opening_balance + coalesce(sum(l.delta), 0)) AS balance
      FROM opening o
      LEFT JOIN legs l USING (account_id)
      GROUP BY o.account_id, o.opening_balance
    ),
    fifo_legs AS (
      SELECT account_id, transaction_id, date, delta FROM legs
      UNION ALL
      SELECT account_id, NULL::uuid AS transaction_id, opening_date AS date,
        opening_balance AS delta
      FROM opening
      WHERE opening_balance <> 0
    ),
    signed_legs AS (
      SELECT l.account_id, l.transaction_id, l.date, l.delta, b.balance, sign(b.balance) AS final_sign
      FROM fifo_legs l JOIN balances b USING (account_id)
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
        sum(abs(delta)) OVER (
          PARTITION BY account_id ORDER BY date, transaction_id NULLS FIRST
        ) AS running_open
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
    ORDER BY o.account_id, o.date, o.transaction_id NULLS FIRST
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
