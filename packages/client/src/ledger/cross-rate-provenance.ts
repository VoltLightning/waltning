/**
 * `crossRateProvenance` — turns `readCrossRate`'s two legs (`LocalCrossRate`,
 * `packages/ledger`) into the one honest display fact S14 and S31's own
 * reference line states.
 *
 * **H2 — the display decision `readCrossRate` used to make for every caller.**
 * A flattened `source`/`asOf`/`carriedDays` there borrowed `source` from
 * whichever leg was manual and `asOf`/`carriedDays` from whichever leg was
 * worse — two different rows' facts glued into one that read as a single
 * claim ("manual, as of 2026-08-05") when the manual leg and the stale leg
 * were not the same row. This function keeps the two facts separate instead:
 * `asOf`/`carriedDays` always describe the *same* leg (`source` too), and
 * `manual` is its own, independent flag — true the moment *either* leg is a
 * person's own correction, regardless of which leg is shown as stale. A
 * screen renders both: *"manual · carried 7 d from 2026-08-05"* states two
 * true things, never one merged one.
 */

import type { AccountingDate } from "@waltning/core/date";

/** Structural — `LocalRate` (`packages/ledger`) and `PhoneRate` (`create-phone-ledger.ts`) both already have this shape. */
export type CrossRateLeg = {
  source: string;
  asOf: AccountingDate;
  carriedDays: number;
};

export type CrossRateProvenance = {
  /** The staler leg's own source — never a leg's `source` paired with the other leg's date (H2). */
  source: string;
  /** The staler leg's own date. */
  asOf: AccountingDate;
  /** The staler leg's own carry. */
  carriedDays: number;
  /** True the instant either leg is a person's own correction, independent of which leg is shown above. */
  manual: boolean;
};

/** `readRate`'s own fabricated self-leg for the pivot currency — never real provenance to display (M1's own reasoning, carried over from `readCrossRate`). */
const FABRICATED_PIVOT_SOURCE = "pivot";

export function crossRateProvenance(legs: {
  from: CrossRateLeg;
  to: CrossRateLeg;
}): CrossRateProvenance {
  const { from, to } = legs;

  // The fabricated pivot self-leg is always exactly as-of the query date
  // with zero carry, so a plain "worse of the two" comparison would win it
  // every time it appears — never the honest answer for the *other*, real
  // leg. Prefer whichever leg is real; only when both are the pivot itself
  // (a same-currency pair with the pivot on both sides) is there no real leg
  // to prefer, and the fabricated one is reported as-is.
  const worse =
    from.source === FABRICATED_PIVOT_SOURCE && to.source !== FABRICATED_PIVOT_SOURCE
      ? to
      : to.source === FABRICATED_PIVOT_SOURCE && from.source !== FABRICATED_PIVOT_SOURCE
        ? from
        : from.carriedDays >= to.carriedDays
          ? from
          : to;

  return {
    source: worse.source,
    asOf: worse.asOf,
    carriedDays: worse.carriedDays,
    manual: from.source === "manual" || to.source === "manual",
  };
}
