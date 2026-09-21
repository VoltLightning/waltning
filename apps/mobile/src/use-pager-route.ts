import {
  enterDay,
  enterMonth,
  enterYear,
  goToPage,
  type PagerPageKey,
  type PagerState,
  type PeriodLabel,
  pagerStateParams,
  parsePagerState,
  periodLabel,
  search,
  step,
  stepUnitOf,
} from "@waltning/client/ledger/pager-date";
import type { AccountingDate, YearMonth } from "@waltning/core/date";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PagerRoute = {
  state: PagerState;
  label: PeriodLabel;
  stepUnit: "month" | "year";
  previous: () => void;
  next: () => void;
  showPage: (page: PagerPageKey) => void;
  showMonth: (month: YearMonth) => void;
  showYear: (year: number) => void;
  showDay: (date: AccountingDate) => void;
  /**
   * The List page saying which day it is on — **recorded, not written**.
   *
   * `router.setParams` re-renders the whole navigation tree, and the render
   * probe counted what that costs here: four commits and ~2,400 component
   * renders, every time a scroll came to rest. Nothing reads the date while
   * the List is the page on screen except the List itself, which already
   * knows. So the day is held here and folded into the *next* write — a page
   * change, a step — in the same `setParams`. S04 §3's promise is kept to the
   * letter: scroll to 25 May, swipe to Calendar, and 25 May is marked, because
   * the swipe carried it.
   */
  noteDay: (date: AccountingDate) => void;
  /** The screen's search (S04 §7). `null` clears it. */
  setQuery: (query: string | null) => void;
};

/**
 * S04's date and page, held by the URL.
 *
 * **This file names the router, so it lives here** (`architecture/11`): the
 * rules are in `@waltning/client/ledger/pager-date`, which knows nothing about
 * expo-router and is tested without it. All this does is make the route the
 * store — read the params, write the params, and let the pure functions decide
 * what a step or a month actually means.
 *
 * **The route is the single source of truth, and the pager is a view of it.**
 * That is the same relationship the pager already had with local state, so
 * nothing about the component changes: `activeKey` comes from here and
 * `onPageChange` comes back here. Two sources — a pager holding an index and a
 * URL holding another — is the drift this arrangement exists to avoid.
 *
 * **`setParams`, not `push`.** Swiping between four views of one date is not
 * four places you have been: a back button that walked a reader out through
 * every page they had swiped past would be a history of their thumb. The
 * *screen* is the history entry; the view within it is a parameter of it.
 *
 * `usePagerDate` remains for anything that wants this state without a route —
 * a story, a test, the desk — and the two share every rule that could be
 * wrong.
 */
/**
 * How long the URL trails the screen, in milliseconds. Long enough that a
 * burst of steps is one write; short enough that a link copied a breath after
 * a tap is the link to what is on screen.
 */
export const URL_LAG_MS = 250;

export function usePagerRoute(today: AccountingDate): PagerRoute {
  const params = useLocalSearchParams<{ view?: string; date?: string; q?: string }>();

  // Everything arriving from the URL is untrusted — an unknown view lands on
  // the summary, a date that is not a real calendar day lands on today.
  const routed = useMemo(
    () => parsePagerState({ view: params.view, date: params.date, q: params.q }, today),
    [params.view, params.date, params.q, today],
  );

  /**
   * **The screen moves first; the URL catches up.**
   *
   * The route is still where this state *lives* — a link carries it, a reload
   * restores it — but it is no longer what a tap waits on.
   * `router.setParams` re-renders expo-router's whole tree, twice, and as the
   * only store that put ~700 component renders and five commits between a
   * finger on a Calendar day and the day being marked. So an act lands in
   * local state at once, which is one render of this screen, and the write to
   * the route follows `URL_LAG_MS` later — by which time a burst of steps has
   * collapsed into one write instead of one each.
   *
   * `ahead` is that local state, and it is dropped the moment the route says
   * something this hook did not write: a deep link, the agent, a back gesture.
   */
  const [ahead, setAhead] = useState<PagerState | null>(null);
  const written = useRef<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const routedKey = `${routed.page}|${routed.date}|${routed.query ?? ""}`;
  useEffect(() => {
    // The route changed. If it is our own write arriving, there is nothing to
    // do; anything else outranks what this hook was holding.
    if (written.current === null || written.current === routedKey) return;
    if (pending.current !== null) return;
    written.current = null;
    setAhead(null);
  }, [routedKey]);

  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );

  const state = ahead ?? routed;
  const latest = useRef(state);
  latest.current = state;

  /** The day the List last said it was on, until a write carries it. */
  const noted = useRef<AccountingDate | null>(null);

  const write = useCallback((next: PagerState) => {
    // Whatever was noted is in `next` already (`base` below) or has just been
    // overruled by a deliberate date; either way it is spent.
    noted.current = null;
    // At once, not on the next render: two acts in one tick — a day and then a
    // page — must compose, and the second would otherwise start from the state
    // before the first.
    latest.current = next;
    setAhead(next);
    written.current = `${next.page}|${next.date}|${next.query ?? ""}`;
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      router.setParams(pagerStateParams(next));
    }, URL_LAG_MS);
  }, []);

  /**
   * **The state these read, without depending on it.**
   *
   * Every one of them is a function of the current state, so closing over it
   * made all five new on every param change — and S04 builds its four page
   * elements from two of them, so a tab tap handed the pager four fresh pages
   * and React re-rendered the whole screen. Measured at 40ms of React work per
   * tab change, against a 16ms frame.
   *
   * Written during render rather than in an effect: an effect runs after the
   * commit, so a tap between the two would step from the state before last.
   * The only thing that changes this state is these functions, and the value
   * is never read during rendering — only inside a handler, after it.
   */

  /** The state an act starts from: the route's, moved to the noted day if there is one. */
  const base = useCallback(
    (): PagerState =>
      noted.current === null ? latest.current : enterDay(latest.current, noted.current),
    [],
  );
  const noteDay = useCallback((date: AccountingDate) => {
    noted.current = date === latest.current.date ? null : date;
  }, []);

  const previous = useCallback(() => write(step(base(), -1)), [base, write]);
  const next = useCallback(() => write(step(base(), 1)), [base, write]);
  const showPage = useCallback(
    (page: PagerPageKey) => write(goToPage(base(), page)),
    [base, write],
  );
  const showMonth = useCallback(
    (month: YearMonth) => write(enterMonth(latest.current, month, today)),
    [today, write],
  );
  const showYear = useCallback(
    (year: number) => write(enterYear(latest.current, year, today)),
    [today, write],
  );
  const showDay = useCallback(
    (date: AccountingDate) => write(enterDay(latest.current, date)),
    [write],
  );
  const setQuery = useCallback(
    (query: string | null) => write(search(base(), query)),
    [base, write],
  );

  const label = useMemo(() => periodLabel(state), [state]);

  return {
    state,
    label,
    stepUnit: stepUnitOf(state.page),
    previous,
    next,
    showPage,
    showMonth,
    showYear,
    showDay,
    noteDay,
    setQuery,
  };
}
