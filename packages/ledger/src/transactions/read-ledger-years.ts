/**
 * Which years the ledger holds anything in — the dot in S04's year picker.
 *
 * **One read for the whole grid, not one per cell.** A picker that asked the
 * ledger whether each of its nine years held something would ask ninety
 * questions over ten pages of paging, and the answer does not change while the
 * sheet is open.
 *
 * **The dot means what the page it points at will draw, so it is the same
 * predicate.** `readDayFlows` is what Months folds, and that read is an inner
 * join to `accounts` and `currencies` keeping own accounts and income or
 * expense only (the ownership and type filters live in `money.dayFlows`,
 * restated here because SQL is where this one can afford them). Filtering only
 * on `deleted_at` offers a dot on a year whose single row is a transfer, or
 * sits on a shared account — and tapping it opens twelve zeroes, which is the
 * third answer the dot exists to remove.
 *
 * **Distinct years off the first four characters of the date.** The column is a
 * bare `YYYY-MM-DD` string (`SPEC.md` §2), so the year is a prefix and the
 * ordering of the strings *is* the ordering of the dates — no `Date` is
 * constructed, which is the rule this column exists under. `substr` defeats
 * `transactions_date_idx`, so this is a scan: at 25k rows on a Pi it is a
 * millisecond, and it runs once per opening of the sheet rather than per cell.
 * If it ever stops being free, the shape that uses the index is a recursive
 * skip-scan of `min(date)` per year — about 26 seeks — not a better filter.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

export function readLedgerYears<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly number[] {
  const rows = db
    .selectDistinct({ year: sql<string>`substr(${transactions.date}, 1, 4)`.as("year") })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(accounts.ownership, "own"),
        inArray(transactions.type, ["income", "expense"]),
      ),
    )
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
