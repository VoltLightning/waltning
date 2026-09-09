/**
 * How the pages move when the period changes — S04 §3.
 *
 * Stepping a month or picking one replaces every figure on all four pages at
 * once. Swapped instantly that reads as a redraw rather than as a move: nothing
 * says which way you went, and on a slow read it is not obvious anything
 * happened at all. The pages come in **from the side you stepped from**, which
 * is the one thing the figures themselves cannot say.
 *
 * **Pure, and worklets.** The style runs on the UI thread, and
 * `.vitest/reanimated.ts` mocks `interpolate` with a no-op — a motion built
 * from `interpolate` would be a motion nothing checks. `collapse.ts` and
 * `track.ts` are the same shape for the same reason.
 */

/** How far a page starts from where it lands, in points. */
export const TRAVEL = 24;

/** `1` forward in time, `-1` back, `0` for the first render and for no change. */
export type Direction = -1 | 0 | 1;

/**
 * Which way the period moved.
 *
 * Compared as strings, which is exact for `YYYY-MM` and `YYYY-MM-DD` alike:
 * both sort lexically the same way they sort in time, which is the whole
 * reason an accounting date is stored as one (`SPEC.md` §7.0a). A first render
 * has nothing to compare against and gets `0` — a screen should not animate
 * itself on arrival.
 */
export function stepDirection(previous: string | null, next: string): Direction {
  "worklet";
  if (previous === null || previous === next) return 0;
  return next > previous ? 1 : -1;
}

/**
 * Whether a change is one the pages should move for.
 *
 * **A page change is not a period change**, however much the key moved. Months
 * is keyed on the year it shows and the other three on their month, so swiping
 * between them changes the string without changing what is being looked at —
 * and the pager is already animating that swipe. Two motions over one gesture
 * is a screen that looks like it reloaded, which is exactly what it was
 * mistaken for.
 */
export function movesFor(
  before: { period: string; page: string } | null,
  after: { period: string; page: string },
): Direction {
  "worklet";
  if (before === null || before.page !== after.page) return 0;
  return stepDirection(before.period, after.period);
}

/**
 * Where a page sits at `progress` — `0` as it arrives, `1` once it has landed.
 *
 * A page entering from a **later** period comes in from the right, because
 * that is the side it would have been on had you swiped there. Stepping back
 * reverses it.
 */
export function enterOffset(direction: Direction, progress: number): number {
  "worklet";
  if (direction === 0) return 0;
  const clamped = Number.isNaN(progress) ? 1 : progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  return direction * TRAVEL * (1 - clamped);
}

/**
 * The page's opacity at `progress`.
 *
 * **It never reaches zero.** A page that vanishes and returns is a page that
 * flickered; one that dips is a page that moved. The figures stay readable
 * throughout, which matters most on the step a reader is watching a number for.
 */
export function enterOpacity(progress: number): number {
  "worklet";
  if (Number.isNaN(progress)) return 1;
  if (progress <= 0) return 0.4;
  if (progress >= 1) return 1;
  return 0.4 + 0.6 * progress;
}
