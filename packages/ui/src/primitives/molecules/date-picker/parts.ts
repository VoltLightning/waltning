/**
 * The arithmetic behind `DatePicker` — `design-system/03` §3.7a.
 *
 * Separate from the component because none of it needs one, and because the
 * rule that matters most here is a rule about *state*: what happens to the day
 * when the month under it changes. A component test would reach that through
 * three wheels and a modal; here it is one call.
 *
 * Every function takes the value's own Y/M/D and returns numbers. No clock is
 * read and no `Date` crosses a boundary — `Date.UTC` appears only to ask the
 * calendar how long a month is, which is the one question arithmetic cannot
 * answer on its own.
 */

import { type AccountingDate, accountingDate } from "@waltning/core/date";

export type Parted = {
  year: number;
  /** Zero-based, the way `Date.UTC` and every month array want it. */
  month: number;
  day: number;
};

/** How many days that month really has, leap years included. */
export function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * **Clamping is final** (§3.7a). Rolling from 31 January to February lands on
 * the 28th, and rolling back to January stays on the 28th — because the
 * alternative is a value that is not what the wheel is showing, and a control
 * whose displayed state is a partial truth is the one people stop trusting.
 *
 * The cost is real and stated rather than argued away: passing through a short
 * month rewrites a date that was already chosen.
 */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(day, 1), daysIn(year, month));
}

export function partsOf(date: string): Parted {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year ?? 0, month: (month ?? 1) - 1, day: day ?? 1 };
}

export function dateOf({ year, month, day }: Parted): AccountingDate {
  const clamped = clampDay(year, month, day);
  return accountingDate(
    `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`,
  );
}

/**
 * The years a ledger entry can name.
 *
 * Bounded rather than endless because §3.7a makes a year a scale, and bounded
 * *here* rather than at some absolute floor: a window around the value keeps
 * the column short enough to flick through, and re-centres if a date outside
 * it is ever loaded — an imported entry from eight years ago must still be
 * reachable by the wheel that is showing it.
 */
export function yearsAround(year: number, back = 8, forward = 1): readonly number[] {
  const years: number[] = [];
  for (let y = year - back; y <= year + forward; y += 1) years.push(y);
  return years;
}
