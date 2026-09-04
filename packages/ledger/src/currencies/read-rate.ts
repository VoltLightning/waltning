/**
 * `readRate` and `readCoverage` — §4/§7.7, against the replica.
 *
 * A rate is read the same way `create-transaction.executor.ts`'s
 * `lastKnownRate` reads one, generalised over an arbitrary `date` rather than
 * "the most recent held" and made to answer the carry-forward question §7.7
 * asks: how many days is this rate being carried forward from, and is that
 * still inside the ten-day cap?
 *
 * **`fx_rates` is stored one way only**, `(base = pivot, quote = X)`, in
 * units-per-pivot (§4) — both callers state `base` and `quote` explicitly
 * rather than trusting the invariant, the same defence `lastKnownRate`
 * argues for.
 */

import { type AccountingDate, daysBetween } from "@waltning/core/date";
import type { CurrencyCode, UnitsPerPivot } from "@waltning/core/money";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { currencies, fxRates } = ledgerSchema;

/** §7.7 — a dead source eventually leaves genuine holes past this many days. */
export const MAX_CARRY_DAYS = 10;

export type LocalRate = {
  rate: UnitsPerPivot;
  source: string;
  /** The rate row's own date — the day it was actually published or set. */
  asOf: AccountingDate;
  /** `date − asOf`. `0` means the rate is exact for the day asked about. */
  carriedDays: number;
};

/**
 * The rate for `(base, quote)` as of `date` — the latest row `≤ date`,
 * refused past the ten-day carry cap.
 *
 * **Refused, not clamped or extrapolated**, matching §7.6's own rule for a
 * missing rate on a transaction: past the cap this returns `undefined`
 * rather than a number that looks like an answer. The caller (a screen, or
 * `create_transaction`'s own provisional-rate resolution once it grows a
 * date-aware path) decides what "no rate" means for it; this function only
 * answers what the replica actually holds.
 */
export function readRate<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  { base, quote, date }: { base: CurrencyCode; quote: CurrencyCode; date: AccountingDate },
): LocalRate | undefined {
  const [row] = db
    .select({ rate: fxRates.rate, source: fxRates.source, date: fxRates.date })
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote), lte(fxRates.date, date)))
    .orderBy(desc(fxRates.date))
    .limit(1)
    .all();

  if (!row) return undefined;

  const carriedDays = daysBetween(row.date, date);
  if (carriedDays > MAX_CARRY_DAYS) return undefined;

  return { rate: row.rate, source: row.source, asOf: row.date, carriedDays };
}

export type LocalCoverage = {
  code: CurrencyCode;
  source: string | null;
  firstDate: AccountingDate;
  lastDate: AccountingDate;
  days: number;
  /** Rows ÷ calendar days from `firstDate` to `today`, an integer 0–100 (S17 §8). */
  coveragePct: number;
};

/**
 * Per non-archived, non-pivot currency: how much of its history the replica
 * actually holds a rate for.
 *
 * **The pivot is excluded** — it has no `fx_rates` row against itself (§4:
 * every row is quoted `base = pivot`, and a currency is never its own
 * quote), so a coverage figure for it would be either vacuous or `NaN`
 * depending on how the empty case were handled, neither of which is a
 * number S17 §8 could show.
 *
 * `today` is the caller's — `packages/ledger` has no clock and no zone of
 * its own, the same reason `readPeriodSpend` takes its `period` from the
 * caller rather than computing one.
 */
export function readCoverage<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  today: AccountingDate,
): readonly LocalCoverage[] {
  const currencyRows = db
    .select({ code: currencies.code, rateSource: currencies.rateSource })
    .from(currencies)
    .where(and(eq(currencies.archived, false), eq(currencies.isPivot, false)))
    .all();

  return currencyRows.map(({ code, rateSource }) => {
    const rateRows = db
      .select({ date: fxRates.date })
      .from(fxRates)
      .where(eq(fxRates.quote, code))
      .orderBy(fxRates.date)
      .all();

    if (rateRows.length === 0) {
      return {
        code,
        source: rateSource,
        firstDate: today,
        lastDate: today,
        days: 0,
        coveragePct: 0,
      };
    }

    const firstDate = rateRows[0]?.date as AccountingDate;
    const lastDate = rateRows[rateRows.length - 1]?.date as AccountingDate;
    const calendarDays = daysBetween(firstDate, today) + 1;
    const coveragePct = calendarDays <= 0 ? 0 : Math.round((rateRows.length / calendarDays) * 100);

    return {
      code,
      source: rateSource,
      firstDate,
      lastDate,
      days: rateRows.length,
      coveragePct: Math.min(100, Math.max(0, coveragePct)),
    };
  });
}

export type LocalRateRow = {
  base: CurrencyCode;
  quote: CurrencyCode;
  date: AccountingDate;
  rate: UnitsPerPivot;
  source: string;
};

/**
 * S18's rate table — every row for one pair across a date range, oldest
 * first. Not `readRate`'s single "as of" answer: the screen this feeds shows
 * the whole held history so a person can spot the gap `readCoverage`
 * summarises as a percentage.
 */
export function listFxRates<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  {
    base,
    quote,
    from,
    to,
  }: { base: CurrencyCode; quote: CurrencyCode; from: AccountingDate; to: AccountingDate },
): readonly LocalRateRow[] {
  return db
    .select({
      base: fxRates.base,
      quote: fxRates.quote,
      date: fxRates.date,
      rate: fxRates.rate,
      source: fxRates.source,
    })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, base),
        eq(fxRates.quote, quote),
        gte(fxRates.date, from),
        lte(fxRates.date, to),
      ),
    )
    .orderBy(asc(fxRates.date))
    .all();
}
