import {
  type AccountingDate,
  accountingDate,
  addDays,
  monthRange,
  shiftMonth,
  type YearMonth,
  yearMonth,
} from "@waltning/core/date";

/**
 * S04 §3 — **there is one date, and the four pages are four ways of looking at
 * it.** That is what makes a swipe feel like turning a page rather than
 * opening a screen, and it is the whole of this file: the rules that keep one
 * date meaningful across pages that disagree about what a period is.
 *
 * Pure, and no React. The hook beside it is four lines; every rule that could
 * be wrong is here, where a test can reach it without rendering anything.
 */

export type PagerPageKey = "summary" | "list" | "calendar" | "months";

export type PagerState = {
  /** Day precision, always — Summary and Months read its month. */
  date: AccountingDate;
  page: PagerPageKey;
};

/**
 * What the arrows move by on each page, and therefore what the label says.
 *
 * **Months steps a year.** Its rows are the months of one year, so an arrow
 * that moved a month would scroll a list by one of its own rows — the reader
 * would step and see almost the same page. The label carries the unit
 * (`September` against `2026`), which is why nothing has to explain the
 * arrows.
 */
export function stepUnitOf(page: PagerPageKey): "month" | "year" {
  return page === "months" ? "year" : "month";
}

/** Move the date by the page's own unit. */
export function step(state: PagerState, by: -1 | 1): PagerState {
  const months = stepUnitOf(state.page) === "year" ? by * 12 : by;
  return { ...state, date: sameDayInMonth(state.date, months) };
}

/**
 * **A month is entered from its newest day, not its first.**
 *
 * The list is reverse-chronological, so landing on the 1st puts the reader at
 * the end of the month with the whole of it behind them — they would have to
 * scroll *up* to read it. The current month is entered at today for the same
 * reason: today is where its newest row is.
 */
export function enterMonth(state: PagerState, month: YearMonth, today: AccountingDate): PagerState {
  const { from, to } = monthRange(month);
  const date = today >= from && today <= to ? today : to;
  return { ...state, date };
}

/** A day picked on the Calendar page, or tapped in the ribbon. */
export function enterDay(state: PagerState, date: AccountingDate): PagerState {
  return { ...state, date };
}

export function goToPage(state: PagerState, page: PagerPageKey): PagerState {
  return { ...state, page };
}

/**
 * What the bar draws, as parts rather than a string.
 *
 * **The formatting is the screen's, because the language is.** A month's name
 * and the reader's language live in `packages/ui`'s i18n, which `client` must
 * never import; handing back parts keeps the seam and makes the one rule worth
 * testing testable without a locale.
 *
 * **`showYear` is false while the period is in the current year** (S04 §3):
 * five things share 326pt, and the year is the one of them usually already
 * known. `September` in 2026, `March 2024` once you have stepped out of it.
 */
export type PeriodLabel =
  | { unit: "month"; month: YearMonth; showYear: boolean }
  | { unit: "year"; year: number };

export function periodLabel(state: PagerState, today: AccountingDate): PeriodLabel {
  const year = Number(state.date.slice(0, 4));
  if (stepUnitOf(state.page) === "year") return { unit: "year", year };
  return {
    unit: "month",
    month: yearMonth(state.date.slice(0, 7)),
    showYear: year !== Number(today.slice(0, 4)),
  };
}

/**
 * The same day of an adjacent month, clamped to that month's length.
 *
 * 31 January stepped forward is 28 February, not 3 March. `Date.UTC` rolls a
 * day-of-month past the end into the next month, which would make one press of
 * an arrow skip a month — and skip it only sometimes, which is the shape of a
 * bug nobody reproduces.
 */
function sameDayInMonth(date: AccountingDate, byMonths: number): AccountingDate {
  const month = shiftMonth(yearMonth(date.slice(0, 7)), byMonths);
  const day = Number(date.slice(8, 10));
  const { from, to } = monthRange(month);
  const candidate = addDays(from, day - 1);
  return candidate > to ? to : accountingDate(candidate);
}
