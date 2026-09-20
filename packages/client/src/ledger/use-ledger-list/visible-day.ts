/**
 * Which day a scrolling list is *on*, and when that may re-anchor it.
 *
 * S04 §6 promises the two pages agree: *"scroll to 25 May on List and Calendar
 * has 25 May marked."* Nothing implemented it, because the date the calendar
 * marks and the date the list is built around were the same value — and
 * writing that value from a scroll re-keys the list, discards both halves of
 * it, and jumps the reader back to the day they just scrolled away from.
 *
 * So they are separated here, as two rules that can be wrong without a
 * component to render:
 *
 * - `visibleDay` — the day the reader is looking at, from what the list says
 *   is on screen.
 * - `reanchors` — whether an incoming date is news, or the list hearing its
 *   own report come back.
 *
 * **Pure, and no React**, for the same reason `list-start-gate.ts` is: neither
 * viewability nor a scroll fires under jsdom, so a rule written inside the
 * component would be dead code in every test that draws it.
 */

/**
 * One viewable position, reduced to the only two things this decides from.
 *
 * **A date, already extracted.** The first version of this took the list's
 * items and read `.date` off them — against a shape it had assumed rather than
 * the one the list actually renders. The call site papered over the difference
 * with a cast, the four-kind union arrived as two, and a row (the commonest
 * thing on screen) fell through to `undefined`, which `accountingDate` then
 * threw on. The rule does not get to guess what an item looks like: whoever
 * owns the items says what day each one is.
 */
export type ViewablePosition = {
  /** `undefined` for an item the list cannot place — RN's own type. */
  index: number | undefined;
  /** `null` for an item that names no day. */
  date: string | null;
};

/**
 * The day the list is on, or `null` when nothing on screen names one.
 *
 * **The topmost viewable item, not the most visible one.** A reader scrolling
 * down reads from the top, and a rule that picked whichever day filled most of
 * the screen would flick back and forth across a day boundary while the
 * fraction crossed a half. Lowest index wins, because `viewableItems` is not
 * ordered by contract.
 *
 * An item with no day is skipped rather than ending the search: a separator
 * at the top of the viewport does not mean the list is on no day.
 */
export function visibleDay(positions: readonly ViewablePosition[]): string | null {
  let best: ViewablePosition | null = null;
  for (const candidate of positions) {
    if (candidate.index === undefined || candidate.date === null) continue;
    if (best === null || candidate.index < (best.index ?? Number.POSITIVE_INFINITY)) {
      best = candidate;
    }
  }
  return best?.date ?? null;
}

/**
 * Whether an incoming date should rebuild the list around itself.
 *
 * **A list must not re-anchor on its own echo.** Scrolling reports a day, the
 * screen writes it to the route, and the route hands it straight back as the
 * anchor prop — which, taken at face value, re-keys the list and scrolls the
 * reader back to where they started. It is news only when it differs from
 * what this list last reported.
 *
 * `reported` is `null` before the list has said anything, when every incoming
 * date is news by definition.
 */
export function reanchors(incoming: string, current: string, reported: string | null): boolean {
  if (incoming === current) return false;
  return incoming !== reported;
}
