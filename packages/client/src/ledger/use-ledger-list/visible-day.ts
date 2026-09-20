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

/** As much of a list item as this needs: the day it belongs to. */
export type DatedItem =
  | { kind: "day"; date: string }
  /** A run of empty days; the first of them is the one on screen. */
  | { kind: "quiet"; from: string };

/** As much of `ViewToken` as this decides anything from. */
export type ViewableItem = { index: number | null; item: DatedItem };

/**
 * The day the list is on, or `null` when nothing is on screen yet.
 *
 * **The topmost viewable item, not the most visible one.** A reader scrolling
 * down reads from the top, and a rule that picked whichever day filled most of
 * the screen would flick back and forth across a day boundary while the
 * fraction crossed a half. Lowest index wins, because `viewableItems` is not
 * ordered by contract.
 */
export function visibleDay(viewableItems: readonly ViewableItem[]): string | null {
  let best: ViewableItem | null = null;
  for (const candidate of viewableItems) {
    if (candidate.index === null) continue;
    if (best === null || candidate.index < (best.index ?? 0)) best = candidate;
  }
  if (best === null) return null;
  return best.item.kind === "day" ? best.item.date : best.item.from;
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
