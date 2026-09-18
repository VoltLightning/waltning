/**
 * The grid behind `Calendar` — `design-system/03` §3.7a's desk affordance.
 *
 * **A month is not seven columns of equal length.** It starts on a weekday
 * the locale decides (`weekStart`: Sunday in `en`, Monday in `pl`), runs a
 * length the year decides, and the cells before and after it belong to
 * neighbouring months. Getting that wrong is invisible in one month and
 * obvious in another, which is why it is arithmetic here rather than a loop
 * inside a component nobody can test a February against.
 *
 * Every function takes the value's own Y/M/D and returns strings. `Date.UTC`
 * appears only to ask the calendar which weekday a day falls on and how long a
 * month is — the two questions arithmetic cannot answer alone — and no clock
 * is ever read.
 */

import { type AccountingDate, accountingDate } from "@waltning/core/date";
import { daysIn } from "../date-picker/parts.ts";

export type Cell = {
  date: AccountingDate;
  /** `false` for the neighbouring month's days that fill the first and last rows. */
  inMonth: boolean;
};

/** `0` Sunday … `6` Saturday, for the first of that month. */
function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}

function iso(year: number, month: number, day: number): AccountingDate {
  return accountingDate(
    `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
}

/**
 * Six rows of seven, always.
 *
 * **A fixed six rather than as many as the month needs**, because a grid that
 * changes height between months moves everything under it as you page —
 * and on the desk this panel is anchored to a field, so a month that grew a
 * row would shift its own footer out from under the pointer mid-click.
 * A month needs at most six and often five; the sixth is filled from the next
 * month like the first is filled from the previous.
 */
export function weeksOf(
  year: number,
  month: number,
  weekStart: 0 | 1,
): readonly (readonly Cell[])[] {
  const lead = (firstWeekday(year, month) - weekStart + 7) % 7;
  const length = daysIn(year, month);
  const previous = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const previousLength = daysIn(previous.year, previous.month);

  const cells: Cell[] = [];
  for (let i = lead; i > 0; i -= 1) {
    cells.push({
      date: iso(previous.year, previous.month, previousLength - i + 1),
      inMonth: false,
    });
  }
  for (let day = 1; day <= length; day += 1) {
    cells.push({ date: iso(year, month, day), inMonth: true });
  }
  for (let day = 1; cells.length < 42; day += 1) {
    cells.push({ date: iso(next.year, next.month, day), inMonth: false });
  }

  const weeks: Cell[][] = [];
  for (let row = 0; row < 6; row += 1) weeks.push(cells.slice(row * 7, row * 7 + 7));
  return weeks;
}

/**
 * The seven column headings, in the week's own order.
 *
 * Returned as dates rather than letters because two columns can share an
 * initial — English has two Tuesdays' worth of "T" — so the letter cannot
 * identify the column, and the caller needs a stable key as well as a label.
 * `MonthGrid` learned this the same way.
 */
export function headingDates(weekStart: 0 | 1): readonly AccountingDate[] {
  // Any week works; this one starts on a Sunday, 2026-03-01.
  const days: AccountingDate[] = [];
  for (let i = 0; i < 7; i += 1) days.push(iso(2026, 2, 1 + ((weekStart + i) % 7)));
  return days;
}
