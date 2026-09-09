import {
  enterDay,
  enterMonth,
  goToPage,
  type PagerPageKey,
  type PagerState,
  type PeriodLabel,
  pagerStateParams,
  parsePagerState,
  periodLabel,
  step,
  stepUnitOf,
} from "@waltning/client/ledger/pager-date";
import type { AccountingDate, YearMonth } from "@waltning/core/date";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef } from "react";

export type PagerRoute = {
  state: PagerState;
  label: PeriodLabel;
  stepUnit: "month" | "year";
  previous: () => void;
  next: () => void;
  showPage: (page: PagerPageKey) => void;
  showMonth: (month: YearMonth) => void;
  showDay: (date: AccountingDate) => void;
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
export function usePagerRoute(today: AccountingDate): PagerRoute {
  const params = useLocalSearchParams<{ view?: string; date?: string }>();

  // Parsed on every render rather than kept in state: the URL is the state,
  // and a copy of it would be a second thing to keep in step. Everything
  // arriving here is untrusted — an unknown view lands on the summary, a date
  // that is not a real calendar day lands on today.
  const state = useMemo(
    () => parsePagerState({ view: params.view, date: params.date }, today),
    [params.view, params.date, today],
  );

  const write = useCallback((next: PagerState) => {
    router.setParams(pagerStateParams(next));
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
  const latest = useRef(state);
  latest.current = state;

  const previous = useCallback(() => write(step(latest.current, -1)), [write]);
  const next = useCallback(() => write(step(latest.current, 1)), [write]);
  const showPage = useCallback(
    (page: PagerPageKey) => write(goToPage(latest.current, page)),
    [write],
  );
  const showMonth = useCallback(
    (month: YearMonth) => write(enterMonth(latest.current, month, today)),
    [today, write],
  );
  const showDay = useCallback(
    (date: AccountingDate) => write(enterDay(latest.current, date)),
    [write],
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
    showDay,
  };
}
