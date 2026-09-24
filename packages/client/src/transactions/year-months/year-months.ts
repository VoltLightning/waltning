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
 * **Every currency, in the pivot, each row at its own rate.** A day row carries
 * its income and spend converted at the rate each transaction was stored with
 * (`computations.md` §4 — *the row's own date*), so a year of złoty, dollars
 * and euros is one set of bars without a rate being looked up or invented.
 * It used to count the *lead* currency only — the first of the net-worth rows —
 * and a ledger whose lead happened to be the card's euros drew a year of spend
 * and not one bar of income, because the salary was in złoty.
 *
 * A day whose rows came without a rate keeps its own currency: counted if it
 * is the pivot's, and otherwise left out and named in `otherCurrencies`.
 *
 * **Every month is a row, including the ones with nothing in them.** A list
 * that skipped empty months would be a list that changes length as the ledger
 * fills, and a year is twelve months whether or not you spent in all of them.
 */

import { type YearMonth, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";

export type YearMonthRow = {
  month: YearMonth;
  /** The month's own income and expense, in the pivot. */
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
  pivot: money.CurrencyCode,
  today: YearMonth,
): readonly YearMonthRow[] {
  const totals = new Map<string, { inflow: money.Money; spend: money.Money }>();
  const others = new Map<string, Set<string>>();

  for (const flow of flows) {
    const month = flow.date.slice(0, 7);
    const figures = inPivot(flow, pivot);
    if (figures === null) {
      const seen = others.get(month) ?? new Set<string>();
      seen.add(flow.currency);
      others.set(month, seen);
      continue;
    }
    const bucket = totals.get(month) ?? { inflow: money.ZERO, spend: money.ZERO };
    totals.set(month, {
      inflow: money.add(bucket.inflow, figures.inflow),
      spend: money.add(bucket.spend, figures.spend),
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
 * How many currencies the year held that the figures leave out.
 *
 * **Counted over the year, not summed over the months.** A ledger holding one
 * USD row in March and another in July is *one* other currency; adding the
 * monthly counts says two. The figure sits beside the year's own total, which
 * is the largest number on the page and was the only one on it carrying no
 * qualifier — the month rows below it have said *+1 other currency* since they
 * were written.
 */
/**
 * A day row's figures in the pivot: converted at each row's own rate, or its
 * own figures when it already is the pivot — `null` when neither holds.
 */
function inPivot(
  flow: money.DayFlowRow,
  pivot: money.CurrencyCode,
): { inflow: money.Money; spend: money.Money } | null {
  if (flow.inflowPivot !== null && flow.spendPivot !== null) {
    return { inflow: flow.inflowPivot, spend: flow.spendPivot };
  }
  return flow.currency === pivot ? { inflow: flow.inflow, spend: flow.spend } : null;
}

/** The currencies the year could not count — none, when every row carried its rate. */
export function otherCurrenciesInYear(
  flows: readonly money.DayFlowRow[],
  pivot: money.CurrencyCode,
): number {
  const seen = new Set<string>();
  for (const flow of flows) if (inPivot(flow, pivot) === null) seen.add(flow.currency);
  return seen.size;
}

/**
 * The largest month in the year, for a bar that is relative to what is on
 * screen rather than to an absolute figure — the same argument `ribbonMarks`
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
