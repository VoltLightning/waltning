/**
 * Every row on one day — the entries S04's Calendar opens under the grid (§3).
 *
 * **A day, not a page.** `readLedgerPage` exists to walk a ledger that does not
 * end, so it is bounded by a row count and reports a cursor. A day ends, and a
 * calendar that showed the first thirty rows of a day and silently stopped
 * would be a shorter truth than the mark above it, which counted all of them.
 * The bound is the date.
 *
 * **The same query and the same signing as the list**, so a row reads
 * identically whichever page it is on. A second projection of a transaction is
 * how two screens come to disagree about what a transfer's amount is.
 */

import type { AccountingDate } from "@waltning/core/date";
import { and, asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import type { LedgerFilter } from "./read-ledger-page.ts";
import {
  ledgerRowsQuery,
  type SignedLedgerRow,
  signRow,
  structuralWhere,
} from "./transaction-query.ts";

const { transactions } = ledgerSchema;

export function readDayRows<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  date: AccountingDate,
  filter: LedgerFilter = {},
): readonly SignedLedgerRow[] {
  const structural = structuralWhere(filter);
  const onTheDay = eq(transactions.date, date);
  return (
    ledgerRowsQuery(db)
      .where(structural === undefined ? onTheDay : and(structural, onTheDay))
      // Ascending by id: the order a day was captured in, which is the only
      // order a single day has — there is no date left to sort by.
      .orderBy(asc(transactions.id))
      .all()
      .map(signRow)
  );
}
