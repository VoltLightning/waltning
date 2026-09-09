/**
 * `monthGrid` — a month as the weeks a calendar draws (S04 §3).
 *
 * **The cells are the model's, not the component's.** Which day the month
 * starts on, how many blanks precede it, which cell is today, which are still
 * ahead and how hard each day was are all decisions with a right answer, and a
 * component that made them could only be checked by rendering it. What is left
 * for `packages/ui` is drawing a grid of what it is handed.
 *
 * **`heavy` is relative to the month on screen, exactly as `ribbonDays` makes
 * it relative to the list on screen.** A ledger whose largest day is 200 zł
 * and one whose largest is 20 000 would otherwise draw every mark the same
 * size — one all small, the other all large — where the mark exists to say
 * *this day was unusual for you*. Half the largest day in the month is the
 * threshold, which makes the biggest day heavy by construction.
 *
 * **A day is `flat` when money moved and none of it left.** Not "nothing
 * happened": that is `none`, and it is drawn by the absence of a mark. The
 * distinction is the whole reason `direction` is three-valued.
 *
 * **A day holding two currencies has no figure.** `dayFlows` refuses to fold
 * them (`money.ts`) and so does this: the day still gets a mark, because
 * something happened, and `net` is `null` because no single number is true.
 * The same shape `ribbonDays` uses for a day it could not price.
 */

import { type AccountingDate, accountingDate, addDays, type YearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";

export type MonthDay = {
  date: AccountingDate;
  /** The day of the month, as drawn. */
  day: number;
  /** `none` · `some` · `heavy` — how much moved, not which way. */
  activity: "none" | "some" | "heavy";
  /** Which way the day netted. `flat` is movement that left nothing behind. */
  direction: "out" | "in" | "flat";
  /** The day's net, or `null` where more than one currency was on it. */
  net: money.Money | null;
  currency: money.CurrencyCode | null;
  decimals: number;
  /** After today — reachable, and drawn quieter (S04 §6). */
  ahead: boolean;
};

/**
 * A cell the grid leaves empty — a day of the month either side of this one.
 *
 * **It carries its real date**, which is the only thing about it that is
 * interesting: it makes every cell in the grid uniquely identifiable without
 * anyone reaching for its position in the row, and a position is not an
 * identity. The grid draws nothing here; the date is a key, not content.
 */
export type MonthBlank = { blank: true; date: AccountingDate };

/** One row of the grid — seven cells, some of which belong to the months either side. */
export type MonthWeek = readonly (MonthDay | MonthBlank)[];

/**
 * Which weekday a row starts on: `0` Sunday, `1` Monday.
 *
 * A number rather than a locale, because this module must not know what a
 * locale is — the same seam `ledger-days` keeps, and the reason `packages/ui`
 * owns i18n.
 */
export type WeekStart = 0 | 1;

const DAYS_IN_WEEK = 7;

/** The first of the month, and how many days it has — from the bare date only. */
function monthBounds(month: YearMonth): { first: AccountingDate; length: number } {
  const [year, mo] = month.split("-").map(Number) as [number, number];
  // Day 0 of the next month is the last day of this one. `Date.UTC` because an
  // accounting date is bare (§7.0a) and must never be read in a local zone.
  const length = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  return { first: accountingDate(`${month}-01`), length };
}

/** `0` Sunday … `6` Saturday, for a bare date. */
function weekdayOf(date: AccountingDate): number {
  const [year, mo, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, mo - 1, day)).getUTCDay();
}

export function monthGrid(
  flows: readonly money.DayFlowRow[],
  month: YearMonth,
  today: AccountingDate,
  weekStart: WeekStart,
): readonly MonthWeek[] {
  // Two currencies on one day is a day with no single figure. Collected first,
  // so the classing below never sees a total that was never true.
  const byDate = new Map<string, money.DayFlowRow[]>();
  for (const flow of flows) {
    const found = byDate.get(flow.date);
    if (found === undefined) byDate.set(flow.date, [flow]);
    else found.push(flow);
  }

  const { first, length } = monthBounds(month);

  let largest = money.ZERO;
  for (const rows of byDate.values()) {
    if (rows.length !== 1) continue;
    const [only] = rows as [money.DayFlowRow];
    const size = money.abs(money.sub(only.inflow, only.spend));
    if (money.cmp(size, largest) > 0) largest = size;
  }
  const half = money.mul(largest, 0.5);

  const days: MonthDay[] = [];
  for (let index = 0; index < length; index++) {
    const date = addDays(first, index);
    const rows = byDate.get(date);
    const ahead = date > today;
    if (rows === undefined) {
      days.push({
        date,
        day: index + 1,
        activity: "none",
        direction: "flat",
        net: money.ZERO,
        currency: null,
        decimals: 2,
        ahead,
      });
      continue;
    }
    if (rows.length > 1) {
      // Something happened and no one number says what.
      const [lead] = rows as [money.DayFlowRow];
      days.push({
        date,
        day: index + 1,
        activity: "some",
        direction: "flat",
        net: null,
        currency: null,
        decimals: lead.decimals,
        ahead,
      });
      continue;
    }
    const [only] = rows as [money.DayFlowRow];
    const net = money.sub(only.inflow, only.spend);
    const size = money.abs(net);
    days.push({
      date,
      day: index + 1,
      activity: money.isZero(size) ? "some" : money.cmp(size, half) >= 0 ? "heavy" : "some",
      direction: money.isZero(net) ? "flat" : money.isPositive(net) ? "in" : "out",
      net,
      currency: only.currency,
      decimals: only.decimals,
      ahead,
    });
  }

  // The blanks before the 1st, so every row is seven cells and the columns line
  // up under their weekday headings. Each carries its own date — the real day
  // of the adjacent month — so no cell is identified by where it sits.
  const lead = (weekdayOf(first) - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const cells: (MonthDay | MonthBlank)[] = [
    ...Array.from({ length: lead }, (_, index) => ({
      blank: true as const,
      date: addDays(first, index - lead),
    })),
    ...days,
  ];
  const last = addDays(first, length - 1);
  while (cells.length % DAYS_IN_WEEK !== 0) {
    cells.push({ blank: true, date: addDays(last, cells.length - lead - length + 1) });
  }

  const weeks: MonthWeek[] = [];
  for (let at = 0; at < cells.length; at += DAYS_IN_WEEK) {
    weeks.push(cells.slice(at, at + DAYS_IN_WEEK));
  }
  return weeks;
}

/**
 * The seven weekday headings, as dates to format — the caller turns them into
 * letters in its own language, and uses the date as the column's key.
 *
 * Dates rather than indices, because a weekday's name is a formatting of a
 * date and `packages/ui`'s `weekdayInitial` already takes one. A number would
 * make this module invent a mapping from `1` to *Monday* that `Intl` already
 * owns.
 */
export function weekdayHeadings(weekStart: WeekStart): readonly AccountingDate[] {
  // 2026-03-01 is a Sunday, so it and the six days after it are one of each.
  const sunday = accountingDate("2026-03-01");
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    addDays(sunday, (index + weekStart) % DAYS_IN_WEEK),
  );
}
