/**
 * The year picker's pages — nine years at a time, back to 1900.
 *
 * **Nine, and paged rather than scrolled.** S04's own four pages are swiped; a
 * year grid inside it that scrolled instead would be a second gesture for the
 * same kind of move. Three across and three down fills the sheet without
 * pushing the grid off it.
 *
 * **1900 is a bound on what a date can be, not a place anyone goes.** A ledger
 * nobody has is still a ledger whose dates must be real: `isRealCalendarDate`
 * already refuses the impossible ones, and this refuses the absurd. Reaching it
 * is fourteen swipes from today, which is the right cost for a year no one
 * visits — an unbounded grid offers 1743 with a straight face.
 *
 * **Pages are counted back from the year we are in, not forward from the
 * floor.** Counted from 1900 the arithmetic lands 2026 alone on a page of its
 * own, which is the one year that must never be alone. Anchored to the top, the
 * page you open holds this year and the eight before it — the years a ledger
 * actually has — and the oldest page is the short one, where shortness costs
 * nothing.
 */

/** The earliest year a page can reach. */
export const FIRST_YEAR = 1900;

export type YearPage = {
  /** Up to nine years, oldest first. The oldest page is short rather than padded. */
  years: readonly number[];
  /** `2018 – 2026`, for the row between the arrows. */
  label: string;
  /** False on the page holding `FIRST_YEAR`. */
  hasOlder: boolean;
  /** False on the page holding `lastYear`. */
  hasNewer: boolean;
};

const PER_PAGE = 9;

/**
 * How many pages back from `lastYear` a year sits. `0` is the page holding
 * `lastYear` itself.
 */
export function pageOf(year: number, lastYear: number): number {
  const bounded = clamp(year, FIRST_YEAR, horizon(lastYear));
  return Math.floor((lastYear - bounded) / PER_PAGE);
}

/**
 * The page holding `year`, bounded above by `lastYear` — the caller's horizon,
 * which is today's year, because a year after this one holds nothing anyone has
 * recorded.
 */
export function yearPage(year: number, lastYear: number): YearPage {
  const last = horizon(lastYear);
  const page = pageOf(year, last);
  const newest = last - page * PER_PAGE;
  const oldest = Math.max(FIRST_YEAR, newest - PER_PAGE + 1);
  const years: number[] = [];
  for (let at = oldest; at <= newest; at++) years.push(at);
  return {
    years,
    // Both years spelled whole: `1900 – 08` reads as a range of months to
    // anyone who has met a date range before.
    label: `${oldest} \u2013 ${newest}`,
    hasOlder: oldest > FIRST_YEAR,
    hasNewer: newest < last,
  };
}

/** A year on the page before or after this one, clamped at both ends. */
export function stepYearPage(year: number, direction: -1 | 1, lastYear: number): number {
  const last = horizon(lastYear);
  const page = pageOf(year, last);
  // `direction` is the reader's: -1 is *older*, which is a HIGHER page number.
  const next = page - direction;
  if (next < 0) return last;
  const newest = last - next * PER_PAGE;
  return clamp(newest, FIRST_YEAR, last);
}

/**
 * **The horizon is never below the floor.** `lastYear` is read from the
 * device's clock, and a phone set to 1850 produced a page of no years at all
 * with both arrows dead — a sheet with nothing in it and no way out but the
 * backdrop. A clock that absurd gets the floor year and a grid of one.
 */
function horizon(lastYear: number): number {
  return Number.isInteger(lastYear) && lastYear > FIRST_YEAR ? lastYear : FIRST_YEAR;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}
