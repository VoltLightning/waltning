import {
  type AccountingDate,
  accountingDate,
  addDays,
  isRealCalendarDate,
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
  /**
   * What the screen is searching for, or `null`.
   *
   * **Beside the date because it behaves like the date** (S04 §7: *"it holds
   * across the pages the way the date does"*). A query held by the List page
   * would be a query the other three cannot see, and §7 asks Calendar and
   * Months to answer *how often, and when* about the same search — which they
   * can only do if the search is the screen's rather than one page's.
   */
  query: string | null;
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

/**
 * **A year is entered from its newest month the ledger has reached.**
 *
 * `enterMonth`'s argument one level up: a reverse-chronological screen is
 * entered from its end, so a past year opens in December. The clamp is the
 * other half — S04 §6 does not go past the end of this month, and picking
 * *2026* while it is September would otherwise put the shared date three months
 * into the future, which every other page then shows. Picking the year you are
 * already in lands on today.
 */
export function enterYear(state: PagerState, year: number, today: AccountingDate): PagerState {
  const december = yearMonth(`${year}-12`);
  const thisMonth = yearMonth(today.slice(0, 7));
  return enterMonth(state, december <= thisMonth ? december : thisMonth, today);
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
 * **The year is a part of its own, not a flag** (S04 §3). It used to be
 * dropped inside the current year, because five things shared 326pt and the
 * year was the one of them usually already known. The header now sets it as a
 * caption under the month rather than beside it, so it costs a line nobody was
 * using instead of a share of the row — and a rule that exists to save width
 * has nothing to save.
 */
export type PeriodLabel =
  | { unit: "month"; month: YearMonth; year: number }
  | { unit: "year"; year: number };

export function periodLabel(state: PagerState): PeriodLabel {
  const year = Number(state.date.slice(0, 4));
  if (stepUnitOf(state.page) === "year") return { unit: "year", year };
  return { unit: "month", month: yearMonth(state.date.slice(0, 7)), year };
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

/**
 * The state as a URL carries it, and back again.
 *
 * **The four pages are views of one date, so they are one route with a
 * parameter — not four routes.** S04 §3 says it in those words, and the URL
 * saying the same thing is what makes `/?view=list&date=2026-05-25` a link the
 * agent can hand you: S03's *see them in the ledger* lands on the List page at
 * that day rather than on the screen's default.
 *
 * **Everything that arrives is untrusted.** A URL is typed by people and
 * generated by models; an unknown view or a malformed date must land somewhere
 * sensible rather than render nothing. A view that is not one of the four
 * falls back to the landing page, and a date that is not a real calendar day
 * falls back to today — the two failures a link most often has.
 */
const PAGE_KEYS: readonly PagerPageKey[] = ["summary", "list", "calendar", "months"];

export function isPagerPageKey(value: string): value is PagerPageKey {
  return (PAGE_KEYS as readonly string[]).includes(value);
}

export function parsePagerState(
  params: { view?: string | undefined; date?: string | undefined; q?: string | undefined },
  today: AccountingDate,
): PagerState {
  const page = params.view !== undefined && isPagerPageKey(params.view) ? params.view : "summary";
  const date =
    params.date !== undefined && isRealCalendarDate(params.date)
      ? accountingDate(params.date)
      : today;
  return { date, page, query: normalizeQuery(params.q) };
}

/**
 * **A blank query is no query; a query with a space in it is a query.**
 *
 * `?q=` and `?q=%20%20` would both filter by the empty string, which matches
 * every row while the field says the screen is narrowed — so blank folds to
 * `null` here.
 *
 * **What is emphatically not done is trimming.** The first version returned
 * `raw.trim()`, and the field is a controlled input: typing a space wrote
 * `"Shop "`, the trim gave back `"Shop"`, React restored the DOM node to the
 * unchanged value, and the space was deleted as it was typed. `market rent`
 * came out `marketrent`, and §13's own grouped-amount grammar — `1 500,00` —
 * was unreachable from the field it was written for. The matcher trims its own
 * needle; this only decides whether there is a search at all.
 */
function normalizeQuery(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  return raw.trim() === "" ? null : raw;
}

export function pagerStateParams(state: PagerState): {
  view: PagerPageKey;
  date: AccountingDate;
  // Empty rather than absent: `setParams` merges, so an omitted key leaves the
  // old one in the URL and clearing a search would not clear it.
  q: string;
} {
  return { view: state.page, date: state.date, q: state.query ?? "" };
}

/** The screen's search, changed. Every other part of the state survives it. */
export function search(state: PagerState, query: string | null): PagerState {
  return { ...state, query: normalizeQuery(query ?? undefined) };
}
