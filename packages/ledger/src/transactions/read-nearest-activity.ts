/**
 * The nearest month that holds anything, from a month that holds nothing —
 * what `design-system/08` §8.1 requires a `range` empty state to offer:
 * *"the nearest period that does, with its count"*.
 *
 * **Two seeks, not a scan.** The closest earlier date is `max(date) < start`
 * and the closest later one is `min(date) >= end`; both are an ordered probe of
 * `transactions_date_idx` rather than a walk, which is what makes this
 * affordable on a screen that asks every time a reader lands on an empty month.
 * The count is then bounded by the month it names.
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

import type { AccountingDate } from "@waltning/core/date";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

export type NearestActivity = {
  /** The nearest day holding something — `2026-09-09`. */
  date: AccountingDate;
  /** Its month, `2026-09`, which is the period the empty state names. */
  month: string;
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

function joined<TRun, TSchema extends typeof ledgerSchema>(db: ReplicaDb<TRun, TSchema>) {
  return db
    .select({ date: transactions.date })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code));
}

export function readNearestActivity<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  period: { start: AccountingDate; end: AccountingDate },
): NearestActivity | null {
  const before = joined(db)
    .where(and(drawn(), lt(transactions.date, period.start)))
    .orderBy(desc(transactions.date))
    .limit(1)
    .all()[0];
  const after = joined(db)
    .where(and(drawn(), gte(transactions.date, period.end)))
    .orderBy(transactions.date)
    .limit(1)
    .all()[0];

  const nearest = closest(period, before?.date, after?.date);
  if (nearest === undefined) return null;

  const month = nearest.slice(0, 7);
  const rows = db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(and(drawn(), sql`substr(${transactions.date}, 1, 7) = ${month}`))
    .all();

  return { date: nearest as AccountingDate, month, count: Number(rows[0]?.count ?? 0) };
}

/**
 * Which of the two is nearer, measured in days off the period's own edges — a
 * string comparison cannot say, and the dates are bare `YYYY-MM-DD` strings
 * (`SPEC.md` §2) that no `Date` may be built from. The gap is counted in whole
 * days from the epoch, which is arithmetic on the calendar rather than on a
 * timestamp: no zone, no hour, no shift.
 */
function closest(
  period: { start: AccountingDate; end: AccountingDate },
  before: string | undefined,
  after: string | undefined,
): string | undefined {
  if (before === undefined) return after;
  if (after === undefined) return before;
  const behind = dayNumber(period.start) - dayNumber(before);
  const ahead = dayNumber(after) - dayNumber(period.end) + 1;
  return ahead < behind ? after : before;
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
