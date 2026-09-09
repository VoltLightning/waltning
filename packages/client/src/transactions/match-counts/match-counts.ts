/**
 * §7's match counts, folded to the shapes Calendar and Months draw.
 *
 * **The counting happened in the ledger, beside the matcher.** §13's text rule
 * cannot be pushed into SQL, so `readMatchDays` shares `searchTransactions`'
 * own `matchesText` — two readings of what a search means is how a count and a
 * list come to disagree. What is left here is arithmetic on the answer, which
 * is why it is pure and lives with the other derived models.
 *
 * **A day or a month with no match is absent, not zero.** The read returns only
 * the days that matched, and both callers already know which days and months
 * they are drawing — a `0` invented here would be this module returning the
 * calendar's own shape back to it.
 */

import type { AccountingDate, YearMonth } from "@waltning/core/date";

/** One day of a searched period, and how many rows in it matched. */
export type MatchDay = { date: AccountingDate; count: number };

/** Keyed by `YYYY-MM-DD`, for a grid that looks a cell up at a time. */
export function matchesByDay(days: readonly MatchDay[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const day of days) out.set(day.date, (out.get(day.date) ?? 0) + day.count);
  return out;
}

/** Keyed by `YYYY-MM`, for twelve rows. */
export function matchesByMonth(days: readonly MatchDay[]): ReadonlyMap<YearMonth, number> {
  const out = new Map<YearMonth, number>();
  for (const day of days) {
    const month = day.date.slice(0, 7) as YearMonth;
    out.set(month, (out.get(month) ?? 0) + day.count);
  }
  return out;
}

/** Every match in the period — the figure the search field's own line states. */
export function totalMatches(days: readonly MatchDay[]): number {
  let total = 0;
  for (const day of days) total += day.count;
  return total;
}
