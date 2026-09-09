import type { AccountingDate, YearMonth } from "@waltning/core/date";
import { useCallback, useMemo, useState } from "react";
import {
  enterDay,
  enterMonth,
  goToPage,
  type PagerPageKey,
  type PagerState,
  type PeriodLabel,
  periodLabel,
  step,
  stepUnitOf,
} from "./pager-date.ts";

export type PagerDate = {
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
 * S04's one date and which of the four pages is looking at it.
 *
 * **Thin on purpose.** Every rule that could be wrong — what an arrow steps,
 * which day a month is entered on, when the year belongs in the label — is in
 * `pager-date.ts`, where a test reaches it without rendering anything. This is
 * the four lines of `useState` that a screen cannot test around.
 *
 * `today` is a parameter, not a read: a hook that called the clock would be
 * untestable at every boundary that matters (the last day of a month, the
 * first of a year) and would disagree with the rest of the screen the moment
 * midnight passed mid-session.
 */
export function usePagerDate(
  today: AccountingDate,
  initialPage: PagerPageKey = "summary",
): PagerDate {
  const [state, setState] = useState<PagerState>({ date: today, page: initialPage, query: null });

  const previous = useCallback(() => setState((s) => step(s, -1)), []);
  const next = useCallback(() => setState((s) => step(s, 1)), []);
  const showPage = useCallback((page: PagerPageKey) => setState((s) => goToPage(s, page)), []);
  const showMonth = useCallback(
    (month: YearMonth) => setState((s) => enterMonth(s, month, today)),
    [today],
  );
  const showDay = useCallback((date: AccountingDate) => setState((s) => enterDay(s, date)), []);

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

export type { PagerPageKey, PagerState, PeriodLabel };
