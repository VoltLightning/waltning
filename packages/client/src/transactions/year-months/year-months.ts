/**
 * `yearMonths` — a year as twelve months with their figures, S04's Months page
 * (§3).
 *
 * **Folded from the same day rows the calendar draws.** One read of the year
 * answers both, and more importantly the two answers cannot disagree: a Months
 * page that ran its own query would be a third implementation of §5 alongside
 * the card and the calendar, and the way a screen ends up saying two different
 * things is two implementations.
 *
 * **The lead currency only, and it is not converted.** Arc-phone has no
 * display-currency conversion — that is class **S** — so a year holding PLN and
 * USD cannot be summed into one bar. The rows carry the lead currency's figures
 * and say how many other currencies were left out, which is the same shape
 * `useWhereItWent` uses for the same reason.
 *
 * **Every month is a row, including the ones with nothing in them.** A list
 * that skipped empty months would be a list that changes length as the ledger
 * fills, and a year is twelve months whether or not you spent in all of them.
 */

import { type YearMonth, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";

export type YearMonthRow = {
  month: YearMonth;
  /** The month's own income and expense, in the lead currency. */
  inflow: money.Money;
  spend: money.Money;
  net: money.Money;
  /** How many other currencies had activity this month and are not in the figures. */
  otherCurrencies: number;
  /** After the month the ledger has reached — reachable, drawn quieter. */
  ahead: boolean;
};

const MONTHS_IN_YEAR = 12;

export function yearMonths(
  flows: readonly money.DayFlowRow[],
  year: number,
  lead: money.CurrencyCode,
  today: YearMonth,
): readonly YearMonthRow[] {
  const totals = new Map<string, { inflow: money.Money; spend: money.Money }>();
  const others = new Map<string, Set<string>>();

  for (const flow of flows) {
    const month = flow.date.slice(0, 7);
    if (flow.currency !== lead) {
      const seen = others.get(month) ?? new Set<string>();
      seen.add(flow.currency);
      others.set(month, seen);
      continue;
    }
    const bucket = totals.get(month) ?? { inflow: money.ZERO, spend: money.ZERO };
    totals.set(month, {
      inflow: money.add(bucket.inflow, flow.inflow),
      spend: money.add(bucket.spend, flow.spend),
    });
  }

  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
    const month = yearMonth(`${year}-${String(index + 1).padStart(2, "0")}`);
    const bucket = totals.get(month) ?? { inflow: money.ZERO, spend: money.ZERO };
    return {
      month,
      inflow: bucket.inflow,
      spend: bucket.spend,
      net: money.sub(bucket.inflow, bucket.spend),
      otherCurrencies: others.get(month)?.size ?? 0,
      ahead: month > today,
    };
  });
}

/**
 * The largest month in the year, for a bar that is relative to what is on
 * screen rather than to an absolute figure — the same argument `ribbonDays`
 * and `monthGrid` make for their marks.
 *
 * **Measured on the larger of income and spend, not on the net.** A month that
 * took 8 000 and spent 8 000 nets to nothing and is not a quiet month; scaling
 * by the net would draw it as one.
 */
export function busiestMonth(rows: readonly YearMonthRow[]): money.Money {
  let largest = money.ZERO;
  for (const row of rows) {
    const size = money.cmp(row.inflow, row.spend) >= 0 ? row.inflow : row.spend;
    if (money.cmp(size, largest) > 0) largest = size;
  }
  return largest;
}
