/**
 * §7's ageing, server side — the oldest still-open `debt` row, per
 * counterparty per currency. The same closed-form FIFO read `find-unsettled.ts`
 * runs for §8, partitioned differently: there by clearing account, here by
 * `(counterparty_id, coalesce(debt_currency, currency))` — §7's own
 * currency rule, shared with `counterparty-balance.ts`.
 *
 * **Kind-agnostic, on purpose.** FIFO consumption is a property of the debt
 * ledger, not of who owes it — `computations.md` §7 restricts *ageing* to
 * companies (O15), never the underlying FIFO fold. This function answers
 * "which row is oldest and open" for every counterparty; the caller decides
 * whether that answer is worth showing (`readCounterpartyBalances` on the
 * phone makes the identical choice — see its own `kind === "company"` guard).
 */

import type { AccountingDate } from "@waltning/core/date";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../client.ts";
import { transactions } from "../schema.ts";
import { debtCurrency, debtDeltaOnCarryingLeg } from "./counterparty-balance.ts";

export type OldestOpenDebtRow = {
  counterpartyId: string;
  currency: string;
  oldestUnconsumedTransactionId: string;
  oldestDate: AccountingDate;
};

type RawRow = {
  counterparty_id: string;
  currency: string;
  oldest_unconsumed_transaction_id: string;
  oldest_date: string;
};

const live = sql`${transactions.deletedAt} is null`;

export async function oldestOpenDebt(db: DbHandle): Promise<readonly OldestOpenDebtRow[]> {
  const query = sql`
    WITH legs AS (
      SELECT
        ${transactions.counterpartyId} AS counterparty_id,
        ${debtCurrency} AS currency,
        ${transactions.id} AS transaction_id,
        ${transactions.date} AS date,
        ${debtDeltaOnCarryingLeg} AS delta
      FROM ${transactions}
      WHERE ${transactions.counterpartyId} IS NOT NULL
        AND ${transactions.counterpartyRole} = 'debt'
        AND ${live}
    ),
    balances AS (
      SELECT counterparty_id, currency, sum(delta) AS balance
      FROM legs GROUP BY counterparty_id, currency
    ),
    signed_legs AS (
      SELECT l.counterparty_id, l.currency, l.transaction_id, l.date, l.delta,
        b.balance, sign(b.balance) AS final_sign
      FROM legs l JOIN balances b USING (counterparty_id, currency)
      WHERE b.balance <> 0
    ),
    consumed AS (
      SELECT counterparty_id, currency, sum(abs(delta)) AS total_consumed
      FROM signed_legs
      WHERE delta <> 0 AND sign(delta) <> final_sign
      GROUP BY counterparty_id, currency
    ),
    opens AS (
      SELECT counterparty_id, currency, transaction_id, date, delta,
        sum(abs(delta)) OVER (
          PARTITION BY counterparty_id, currency ORDER BY date, transaction_id
        ) AS running_open
      FROM signed_legs
      WHERE delta <> 0 AND sign(delta) = final_sign
    )
    SELECT DISTINCT ON (o.counterparty_id, o.currency)
      o.counterparty_id AS counterparty_id,
      o.currency AS currency,
      o.transaction_id AS oldest_unconsumed_transaction_id,
      o.date AS oldest_date
    FROM opens o
    JOIN balances b USING (counterparty_id, currency)
    LEFT JOIN consumed c USING (counterparty_id, currency)
    WHERE o.running_open > coalesce(c.total_consumed, 0)
    ORDER BY o.counterparty_id, o.currency, o.date, o.transaction_id
  `;

  const result = await db.execute<RawRow>(query);
  return [...result].map((row) => ({
    counterpartyId: row.counterparty_id,
    currency: row.currency,
    oldestUnconsumedTransactionId: row.oldest_unconsumed_transaction_id,
    oldestDate: row.oldest_date as AccountingDate,
  }));
}
