/**
 * A deterministic FX rate-table generator, for one currency pair over a
 * consecutive run of dates.
 *
 * `read-equals-write.test.ts`'s fixture, not a second implementation of
 * `fillForward` (`packages/db/src/fx/sources.ts`) — this only has to be *some*
 * table `readRate` (`currencies/read-rate.ts`) can be asked about, real
 * quotes and `carried_forward` chains and all, mechanically reproducible from
 * one seed so a failing date can be reported and revisited.
 *
 * **Two `"derived"` rows.** `FX_SOURCE` (`@waltning/schema/enums`) now lists
 * `derived` alongside `nbp`, `carried_forward` and `manual` — R1's own
 * rebase added it — so this generator produces two of them, at fixed
 * relative positions distinct from the one `manual` row: `findOrigin`
 * (`currencies/read-rate.ts`) treats `derived` as an origin exactly like a
 * real quote (only `carried_forward` is excluded), so two adjacent
 * `derived` days exercise the same carry-forward and origin-walk paths a
 * real quote would, off a source `change_pivot` actually produces.
 */

import { type AccountingDate, accountingDate, addDays, daysBetween } from "@waltning/core/date";
import type { FxSource } from "@waltning/schema/enums";

/** The four sources this generator can produce. */
export type RateSource = Extract<FxSource, "nbp" | "manual" | "carried_forward" | "derived">;

export type RateRow = {
  date: AccountingDate;
  /** A plain decimal string — `seedRate`'s own `rate` parameter, unbranded until `money.unitsPerPivot` brands it. */
  rate: string;
  source: RateSource;
};

/**
 * The run's first date. A Thursday, chosen to match
 * `weekend-capture.journey.test.ts`'s own fixtures — `+1`..`+4` land on
 * Fri/Sat/Sun/Mon exactly as that file's `"2026-01-02"`..`"2026-01-05"` do —
 * so a date this generator prints reads the same way across both files.
 */
export const RATE_TABLE_START: AccountingDate = accountingDate("2026-01-01");

/**
 * How many calendar days a `carried_forward` row is allowed to reach past
 * the real row it copies. Deliberately tighter than `readRate`'s own
 * ten-day cap (`MAX_CARRY_DAYS`, `currencies/read-rate.ts`) so an ordinary
 * run of dates carries a few short chains rather than one long one — the
 * ten-day boundary itself is what the one 15-day hole below exists to probe.
 */
const CARRY_LIMIT = 3;

/**
 * How long the one deliberate hole runs. Long enough that late dates inside
 * it clear `readRate`'s ten-day cap and come back refused (`readRate`
 * returns `undefined`), while early dates inside it still resolve through
 * the row standing just before it — both branches of §7.6's table on one
 * generated run.
 */
const HOLE_DAYS = 15;

/**
 * mulberry32 — a 32-bit seeded PRNG, inline. Six lines, and every call is
 * reproducible for a given seed, which is the property this whole module
 * exists to guarantee.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Monday..Friday, by the same `Date.UTC` day-count device `date.ts` uses elsewhere — never a clock. */
function isWeekday(date: AccountingDate): boolean {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

/**
 * Generate a table for one pair, over `days` consecutive dates starting at
 * `RATE_TABLE_START`.
 *
 * **Deterministic for a seed.** The one manual row, the two `derived` rows,
 * and the one hole sit at fixed relative positions (the manual row and the
 * `derived` pair both before the hole, the hole running to the end of the
 * range) so every seed's table has the same shape; only which weekdays land
 * a real quote — the 0.8 draw — varies with the seed.
 */
export function generateRateTable(seed: number, days: number): RateRow[] {
  const rng = mulberry32(seed);
  const rows: RateRow[] = [];

  const holeStart = Math.max(0, days - HOLE_DAYS);
  const manualDay = Math.floor(holeStart / 2);
  // Two adjacent days, well clear of `manualDay` — `change_pivot`'s own
  // rewrite produces a `derived` row per rebased quote, never a lone one, so
  // a back-to-back pair (one carrying into the other exactly like two real
  // quotes would) is the representative shape, not an isolated day.
  const derivedDay = Math.floor(holeStart / 4);

  let lastReal: { date: AccountingDate; rate: string } | undefined;

  const draw = () => (0.2 + rng() * 0.1).toFixed(4);

  for (let i = 0; i < days; i++) {
    const date = addDays(RATE_TABLE_START, i);

    // The one 15-day hole — no row at all, real or carried, so late dates
    // inside it clear the ten-day cap and early ones still resolve through
    // whatever stands just before it.
    if (i >= holeStart) continue;

    if (i === manualDay) {
      const rate = draw();
      rows.push({ date, source: "manual", rate });
      // A manual row is an origin, exactly like a real quote — `findOrigin`
      // (`currencies/read-rate.ts`) walks back past `carried_forward` rows
      // only, so the next gap carries forward from this one too.
      lastReal = { date, rate };
      continue;
    }

    if (i === derivedDay || i === derivedDay + 1) {
      const rate = draw();
      rows.push({ date, source: "derived", rate });
      // Same origin treatment as `manual`/`nbp` above — `derived` is never
      // excluded by `findOrigin`'s own walk-back, only `carried_forward` is.
      lastReal = { date, rate };
      continue;
    }

    if (isWeekday(date) && rng() < 0.8) {
      const rate = draw();
      rows.push({ date, source: "nbp", rate });
      lastReal = { date, rate };
      continue;
    }

    if (lastReal && daysBetween(lastReal.date, date) <= CARRY_LIMIT) {
      rows.push({ date, source: "carried_forward", rate: lastReal.rate });
    }
    // Otherwise: a short gap past the carry limit — no row, until the next
    // real (or manual) quote lands and `lastReal` moves forward.
  }

  return rows;
}
