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
import type { CurrencyCode, PivotPerUnit, UnitsPerPivot } from "@waltning/core/money";
import { dec, pivotPerUnit, unitsPerPivot } from "@waltning/core/money";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { currencies, fxRates } = ledgerSchema;

/**
 * The server's own carried-forward marker (`packages/db/src/fx/sources.ts`'s
 * `fillForward`) — a row with this source is not itself an origin, only a
 * copy of the nearest real quote's rate.
 */
const CARRIED_FORWARD = "carried_forward";

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
 * The nearest row `≤ asOf` whose own source is real — walking past any
 * `carried_forward` rows in between. Shared by `readRate` and `listFxRates`:
 * both need the same "how many days is this being carried" answer, and a
 * second, slightly different walk-back here is exactly how the two would
 * drift on the ten-day cap (see `readRate`'s own note on why the cap must
 * not chain).
 */
function findOrigin<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  { base, quote, asOf }: { base: CurrencyCode; quote: CurrencyCode; asOf: AccountingDate },
): { date: AccountingDate; source: string } | undefined {
  const [real] = db
    .select({ date: fxRates.date, source: fxRates.source })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, base),
        eq(fxRates.quote, quote),
        lte(fxRates.date, asOf),
        ne(fxRates.source, CARRIED_FORWARD),
      ),
    )
    .orderBy(desc(fxRates.date))
    .limit(1)
    .all();
  return real;
}

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
 *
 * **The cap does not chain.** `fillForward` (`packages/db/src/fx/sources.ts`)
 * already stores up to `MAX_CARRY_DAYS` `carried_forward` rows past a real
 * quote, each stamped with its own date. Measuring `carriedDays` from the
 * *latest stored row* rather than from the real quote it descends from would
 * let a dead source be read up to `2 × MAX_CARRY_DAYS` stale before this
 * ever refuses it — the ten-day cap applied twice, once by the server's fill
 * and once here, instead of once in total. So when the latest row is itself
 * `carried_forward`, this walks back to the nearest row with a real source
 * and measures — and reports — from *that* row instead.
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

  let origin: { date: AccountingDate; source: string } = row;
  if (row.source === CARRIED_FORWARD) {
    const real = findOrigin(db, { base, quote, asOf: row.date });
    // No locatable origin (C2) — `change_pivot` can drop the bridge row a
    // carried date descends from while leaving the carried row itself; that
    // is a refusal, never a `carriedDays: 0` that reads as an exact quote.
    if (!real) return undefined;
    origin = real;
  }

  const carriedDays = daysBetween(origin.date, date);
  if (carriedDays > MAX_CARRY_DAYS) return undefined;

  return { rate: row.rate, source: origin.source, asOf: origin.date, carriedDays };
}

export type LocalCoverage = {
  code: CurrencyCode;
  source: string | null;
  firstDate: AccountingDate;
  /**
   * The most recent date a *real* (non-`carried_forward`) quote is held —
   * `null` when every held row is `carried_forward` (H2). Never a stand-in
   * date: `firstDate` would understate the gap, and `today` would hide it
   * entirely.
   */
  lastDate: AccountingDate | null;
  /** Rows held, real and carried alike. Never the decision variable itself — see `realDays`/`calendarDays` below (H3, M3). */
  days: number;
  /**
   * Real (non-`carried_forward`) rows held — `CoverageTag`'s decision
   * variable for *complete* (M3): a dead source carried every day to today
   * fills `days` to `calendarDays` without a single fresh quote, and must
   * still read amber.
   */
  realDays: number;
  /** Calendar days from `firstDate` to `today`, inclusive. `0` only when `days` is also `0`. */
  calendarDays: number;
  /**
   * Display-only (H3) — `CoverageTag` decides *no rates yet* on `days === 0`
   * and *complete* on `realDays === calendarDays`, never on this rounding.
   * Derived from `realDays`, never `days` (M1): a dead source carried every
   * day to today must not read `100%` off nine carried rows and one real
   * quote. Floored while incomplete, so 2,075/2,080 reads `99%`, never `100%`.
   */
  coveragePct: number;
  /**
   * L7 — rows held *past* today (S18 §7's "set a range" allows a future end
   * date), excluded from `days`/`calendarDays`/`coveragePct` alike (M4) so
   * they cannot inflate a figure `calendarDays` only counts through today.
   * `CoverageTag` reads this instead when `days === 0`: a currency with only
   * future rows has held rates set, just none due yet — a different state
   * from *no rates yet*, and worth saying so rather than reading identically.
   */
  futureRows: number;
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

  const [pivotRow] = db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.isPivot, true))
    .all();
  const pivot = pivotRow?.code;

  return currencyRows.map(({ code, rateSource }) => {
    const empty: LocalCoverage = {
      code,
      source: rateSource,
      firstDate: today,
      lastDate: null,
      days: 0,
      realDays: 0,
      calendarDays: 0,
      coveragePct: 0,
      futureRows: 0,
    };
    // No pivot set at all — vacuous, same empty answer as a currency with
    // no rows (`fx_rates` is always stored `base = pivot`, §4).
    if (!pivot) return empty;

    // One aggregate, never `.all()`'d rows (M7) — `min`/`max` sort correctly
    // on the bare `YYYY-MM-DD` text SQLite stores. `lastRealDate` excludes
    // `carried_forward` (H4, S17 §8: *last quote date*, not last held row).
    // `realDays` counts the same real rows (M3) — the decision variable for
    // *complete*, never `days`, which a dead source carried to today fills
    // without a fresh quote. Every count but `futureN` is scoped `date <=
    // today` in the `case` itself (M4) rather than the `where` — L7 needs
    // `futureN`'s complementary count from the very same aggregate, still
    // one query per currency.
    const [agg] = db
      .select({
        n: sql<number>`count(case when ${fxRates.date} <= ${today} then 1 else null end)`,
        realN: sql<number>`count(case when ${fxRates.date} <= ${today} and ${fxRates.source} <> ${CARRIED_FORWARD} then 1 else null end)`,
        firstDate: sql<
          string | null
        >`min(case when ${fxRates.date} <= ${today} then ${fxRates.date} else null end)`,
        lastRealDate: sql<
          string | null
        >`max(case when ${fxRates.date} <= ${today} and ${fxRates.source} <> ${CARRIED_FORWARD} then ${fxRates.date} else null end)`,
        futureN: sql<number>`count(case when ${fxRates.date} > ${today} then 1 else null end)`,
      })
      .from(fxRates)
      .where(and(eq(fxRates.quote, code), eq(fxRates.base, pivot)))
      .all();

    const days = agg?.n ?? 0;
    const futureRows = agg?.futureN ?? 0;
    if (days === 0 || !agg?.firstDate) return { ...empty, futureRows };

    const firstDate = agg.firstDate as AccountingDate;
    const realDays = agg.realN ?? 0;
    const lastDate = agg.lastRealDate as AccountingDate | null;
    const calendarDays = daysBetween(firstDate, today) + 1;
    // M1 — derived from `realDays`, never `days`: a dead source carried
    // every day since the one real quote must not read `100%`. Never
    // reaches `100` unless `realDays === calendarDays` (the same test
    // `CoverageTag` uses for *complete*) — floored otherwise, so
    // 1 real quote over 10 calendar days reads `10%`, not `100%`.
    const coveragePct =
      calendarDays <= 0
        ? 0
        : realDays >= calendarDays
          ? 100
          : Math.floor((realDays / calendarDays) * 100);

    return {
      code,
      source: rateSource,
      firstDate,
      lastDate,
      days,
      realDays,
      calendarDays,
      coveragePct,
      futureRows,
    };
  });
}

export type LocalRateRow = {
  base: CurrencyCode;
  quote: CurrencyCode;
  date: AccountingDate;
  rate: UnitsPerPivot;
  source: string;
  /**
   * Only present when `source === "carried_forward"` — `readRate`'s own
   * figure, per row. `RateTable` (`04` §4.6) needs it to state a carried
   * row's own age (*carried · 3 d*) rather than the bare enum.
   *
   * `null` (C2) means the origin is unlocatable — `change_pivot` dropped
   * the bridge row this carried date descends from. Never `0`, which would
   * read as an exact quote rather than an age nobody can state.
   */
  carriedDays?: number | null;
};

/**
 * S18's rate table — every row for one pair across a date range, oldest
 * first. Not `readRate`'s single "as of" answer: the screen this feeds shows
 * the whole held history so a person can spot the gap `readCoverage`
 * summarises as a percentage.
 *
 * **`carriedDays` is filled in per `carried_forward` row**, walking back to
 * its origin the same way `readRate` does (`findOrigin`) — one extra query
 * per carried row in the range, which a settings screen's own range (30 d ·
 * 90 d · a year) pays for once, on demand, not per frame.
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
  const rows = db
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

  return rows.map((row) => {
    if (row.source !== CARRIED_FORWARD) return row;
    const origin = findOrigin(db, { base, quote, asOf: row.date });
    // No locatable origin (C2) is `carriedDays: null`, explicitly — never
    // the row unchanged, which `RateTable` would read as `?? 0` and render
    // as an exact quote.
    return origin
      ? { ...row, carriedDays: daysBetween(origin.date, row.date) }
      : { ...row, carriedDays: null };
  });
}

export type LocalCrossRate = {
  /**
   * **Pivot-per-unit, for this pair — multiply an amount in `from` by this to
   * reach `to`.** Not `fx_rates`' own stored direction: the pivot (§7.0) is
   * invisible past this function, and a caller triangulating through it by
   * hand is exactly what `readCrossRate` exists to spare every screen from
   * writing once each.
   */
  rate: PivotPerUnit;
  /**
   * H2 — both legs' own provenance, whole and unmixed. A flattened
   * `source`/`asOf`/`carriedDays` here used to borrow `source` from whichever
   * leg was manual and `asOf`/`carriedDays` from whichever was worse — two
   * different rows' facts glued into one that named neither honestly. This
   * function triangulates a *rate*; which leg to show, and how, is a display
   * decision for the caller (`crossRateProvenance`, `packages/client`) — not
   * this data layer's to pre-merge.
   */
  legs: { from: LocalRate; to: LocalRate };
};

/**
 * A reference rate between two arbitrary currencies, as of `date` — S14 and
 * S31's own reference line, and the one place `fx_rates`' pivot-only storage
 * (§7.0: *"It is invisible: it appears in no screen and no export"*) is
 * triangulated so nothing above `packages/ledger` ever has to know which
 * currency the pivot is.
 *
 * **Refused, not guessed**, the same rule `readRate` states for itself: no
 * pivot row, or either leg past the ten-day carry cap, and this returns
 * `undefined` rather than a number that looks like an answer. A screen reads
 * that as "no reference" — S31 §6's offline-with-no-rate state, where the
 * destination amount stays empty and the person types it.
 */
export function readCrossRate<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  { from, to, date }: { from: CurrencyCode; to: CurrencyCode; date: AccountingDate },
): LocalCrossRate | undefined {
  const [pivotRow] = db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.isPivot, true))
    .all();
  if (!pivotRow) return undefined;
  const pivot = pivotRow.code;

  // The pivot has no `fx_rates` row against itself (`readCoverage`'s own
  // comment — "a currency is never its own quote"), so its own leg is
  // trivial rather than a lookup: 1 pivot is 1 unit of itself, exactly, as of
  // the date asked about.
  const leg = (code: CurrencyCode): LocalRate | undefined =>
    code === pivot
      ? { rate: unitsPerPivot(1), source: "pivot", asOf: date, carriedDays: 0 }
      : readRate(db, { base: pivot, quote: code, date });

  const fromLeg = leg(from);
  const toLeg = leg(to);
  if (!fromLeg || !toLeg) return undefined;

  // Both legs are `UnitsPerPivot` (§4: units of the currency per one pivot).
  // 1 unit of `from` is `1 / fromLeg.rate` pivot, and that many pivots are
  // `toLeg.rate` times as many units of `to` — so the cross rate is the
  // ratio of the two, pivot cancelled.
  const rate = pivotPerUnit(dec(toLeg.rate).dividedBy(fromLeg.rate));

  // H2 — both legs, whole and unmixed. Which one is "worse", whether either
  // is a fabricated pivot self-leg, and whether to say "manual" are all
  // display decisions a caller makes over the two real facts here, never a
  // single merged fact this function hands back pre-decided.
  return { rate, legs: { from: fromLeg, to: toLeg } };
}
