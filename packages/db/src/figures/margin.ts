/**
 * §4a / §7.5, server side — the cost of a cross-currency transfer, as SQL.
 *
 * `transactions_valued`'s own formula, inlined: `amount_pivot = amount_original
 * × fx_rate`, `to_amount_pivot = to_amount × to_fx_rate` (`0005_transactions_valued.sql`).
 * Every other figure in this folder inlines its formula the same way rather
 * than reading the view directly — `net-worth.ts`'s `balance` fragment is the
 * precedent — because `packages/db/src/schema.ts` has no Drizzle object for a
 * *view*, only for the base table.
 *
 * Only rows the formula actually applies to: a transfer with both amounts and
 * both rates present, not soft-deleted. A same-currency transfer's margin is
 * always zero (`fxRate` and `toFxRate` both being the pivot's own rate), which
 * is the correct answer, not a case to filter out.
 */

import type { Money } from "@waltning/core/money";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../client.ts";
import { transactions } from "../schema.ts";

export type MarginRow = {
  id: string;
  marginPivot: Money;
  /**
   * The plain ratio §4a defines — margin ÷ amount_pivot — not ×100.
   *
   * M2 — nullable. `amount_pivot` is guarded by `NULLIF` below, and
   * `transactions_amount_positive` standing `NOT VALID` (M1) means a
   * pre-existing zero-amount row can still reach this query — its margin is
   * genuinely unpriceable, not a number to fake.
   */
  marginPct: Money | null;
  /**
   * `to_amount ÷ amount_original` — derived here too, never stored (§7.5).
   *
   * M2 — nullable for the same reason `marginPct` is: `amount_original` is
   * guarded by `NULLIF` below.
   */
  realizedRate: Money | null;
};

const live = sql`${transactions.deletedAt} is null`;

const amountPivot = sql`(${transactions.amountOriginal} * ${transactions.fxRate})`;
const toAmountPivot = sql`(${transactions.toAmount} * ${transactions.toFxRate})`;

/**
 * H4 / M2 — `transactions_amount_positive` refuses `amount_original <= 0`
 * for anything but an adjustment (and a transfer is never one) for every
 * *new* row, but M1's migration adds that CHECK `NOT VALID`: a database that
 * already held a zero-amount transfer before the tightening keeps it,
 * ungraded, until the owner runs `VALIDATE CONSTRAINT`. `NULLIF` is the
 * defence for exactly that row — a division by zero is a Postgres error for
 * the *whole* query, and one bad row must not take every other row's margin
 * down with it — it reads `null` on the row it cannot price, not a thrown
 * query.
 */
const safeAmountPivot = sql`NULLIF(${amountPivot}, 0)`;
/** M2 — the same defence, for `realizedRate`'s own denominator. */
const safeAmountOriginal = sql`NULLIF(${transactions.amountOriginal}, 0)`;

export async function transactionMargins(db: DbHandle): Promise<MarginRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      marginPivot: sql<Money>`(${amountPivot} - ${toAmountPivot})::numeric(20,8)::text`,
      marginPct: sql<Money | null>`((${amountPivot} - ${toAmountPivot}) / ${safeAmountPivot})::numeric(20,8)::text`,
      realizedRate: sql<Money | null>`(${transactions.toAmount} / ${safeAmountOriginal})::numeric(20,8)::text`,
    })
    .from(transactions)
    .where(
      sql`${transactions.type} = 'transfer'
        and ${transactions.toAmount} is not null
        and ${transactions.toFxRate} is not null
        and ${live}`,
    )
    .orderBy(transactions.id);
  return rows;
}
