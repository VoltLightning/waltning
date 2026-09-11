/**
 * Which years the ledger holds anything in — the dot in S04's year picker.
 *
 * **One read for the whole grid, not one per cell.** A picker that asked the
 * ledger whether each of its nine years held something would ask ninety
 * questions over ten pages of paging, and the answer does not change while the
 * sheet is open.
 *
 * **Distinct years off the date column, which is indexed.** `transactions.date`
 * is a bare `YYYY-MM-DD` string (`SPEC.md` §2), so the year is its first four
 * characters and the ordering of the strings *is* the ordering of the dates —
 * no `Date` is constructed, which is the rule this column exists under.
 */

import { isNull, sql } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { transactions } = ledgerSchema;

export function readLedgerYears<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly number[] {
  const rows = db
    .selectDistinct({ year: sql<string>`substr(${transactions.date}, 1, 4)`.as("year") })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all();
  const years: number[] = [];
  for (const row of rows) {
    const year = Number(row.year);
    // A row whose date the schema somehow let through as unparseable is not a
    // year to offer; the grid is a navigation aid, not a place to surface it.
    if (Number.isInteger(year)) years.push(year);
  }
  return years.sort((a, b) => a - b);
}
