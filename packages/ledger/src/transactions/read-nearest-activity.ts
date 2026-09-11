/**
 * The nearest month that holds anything, from a period that holds nothing —
 * what `design-system/08` §8.1 requires a `range` empty state to offer:
 * *"the nearest period that does, with its count"*.
 *
 * **Three index probes.** The closest earlier date is `max(date) < start`, the
 * closest later one is `min(date) >= end`, and the count is bounded by the two
 * ends of the month those name. All three are ordered reads of
 * `transactions_date_idx`; an earlier spelling counted with
 * `substr(date, 1, 7) = ?`, which is not sargable and turned the third into a
 * scan of the table (1.9 ms at 25k rows, and a false claim in this comment).
 *
 * **The same predicate the calendar draws.** Own accounts, income and expense —
 * `readDayFlows`' filter, restated here in SQL. Offering a month whose only row
 * is a transfer would send a reader somewhere that looks just as empty as where
 * they were, which is worse than saying nothing.
 *
 * **A tie goes to the past.** Equidistant months are a real case (a ledger with
 * August and October, a reader on September), and everything else on this
 * screen is reverse-chronological: the month you have already lived is the one
 * you are more likely to be looking for.
 */

import {
  type AccountingDate,
  accountingDate,
  daysBetween,
  monthRange,
  type YearMonth,
  yearMonth,
} from "@waltning/core/date";
import { and, count, desc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

export type NearestActivity = {
  /** The nearest day holding something — `2026-09-09`. */
  date: AccountingDate;
  /** Its month, which is the period the empty state names. */
  month: YearMonth;
  /** How many entries that **month** holds, which is what §8.1 asks for. */
  count: number;
};

/** `where` every read of this figure shares: own accounts, income and expense. */
function drawn() {
  return and(
    isNull(transactions.deletedAt),
    eq(accounts.ownership, "own"),
    inArray(transactions.type, ["income", "expense"]),
  );
}

export function readNearestActivity<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  period: { start: AccountingDate; end: AccountingDate },
): NearestActivity | null {
  const probe = () =>
    db
      .select({ date: transactions.date })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currency, currencies.code));

  const before = probe()
    .where(and(drawn(), lt(transactions.date, period.start)))
    .orderBy(desc(transactions.date))
    .limit(1)
    .all()[0];
  const after = probe()
    .where(and(drawn(), gte(transactions.date, period.end)))
    .orderBy(transactions.date)
    .limit(1)
    .all()[0];

  const nearest = closest(period, before?.date, after?.date);
  if (nearest === undefined) return null;

  const month = yearMonth(nearest.slice(0, 7));
  const bounds = monthRange(month);
  const counted = db
    .select({ rows: count() })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(and(drawn(), gte(transactions.date, bounds.from), lte(transactions.date, bounds.to)))
    .all();

  const rows = counted[0]?.rows;
  // An aggregate always returns its row, so no row is a broken read rather
  // than a month holding nothing — and *0 entries* under a probe that just
  // found one is the kind of nullish "didn't work" this project refuses.
  if (rows === undefined) throw new Error("readNearestActivity: the count returned no row");

  return { date: accountingDate(nearest), month, count: rows };
}

/**
 * Which of the two is nearer, measured off the period's own edges — a string
 * comparison cannot say. `daysBetween` is `core/date`'s, rather than a fourth
 * copy of the same subtraction: `period.end` is exclusive, so the gap ahead is
 * measured from the last day the period actually covers.
 */
function closest(
  period: { start: AccountingDate; end: AccountingDate },
  before: string | undefined,
  after: string | undefined,
): string | undefined {
  if (before === undefined) return after;
  if (after === undefined) return before;
  const behind = daysBetween(accountingDate(before), period.start);
  const ahead = daysBetween(period.end, accountingDate(after)) + 1;
  return ahead < behind ? after : before;
}
