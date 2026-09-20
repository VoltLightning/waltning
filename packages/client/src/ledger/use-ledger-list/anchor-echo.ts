/**
 * Whether an incoming anchor is news, or the list hearing its own report come
 * back.
 *
 * S04 §3 promises the four pages agree: *"scroll to 25 May on List and
 * Calendar has 25 May marked."* The date the calendar marks and the date the
 * list is built around are the same value, so honouring that promise means the
 * list writes it — and taking that write back at face value re-keys the list,
 * discards both halves of it, and jumps the reader to the day they just
 * scrolled away from. The scroll fighting itself.
 *
 * **What changed is how often this is asked.** It used to be asked on every
 * scroll frame, because the list reported the topmost visible day continuously
 * — which made every frame of a gesture a selection, and made this rule the
 * only thing standing between the reader and a reload per frame. The list now
 * reports once, when it settles (S04 §7), so this guards one write per gesture
 * rather than sixty. It is kept because the echo is still an echo.
 *
 * **Pure, and no React**, for the same reason `list-start-gate.ts` is: a
 * scroll does not fire under jsdom, so a rule written inside the component
 * would be dead code in every test that draws it.
 */

/**
 * `true` when `incoming` should rebuild the list around a new day.
 *
 * - The same day it is already on is never news.
 * - The day it just reported is never news — that is the echo.
 * - Anything else is a jump: a tap on the strip, the Today pill, the picker,
 *   the header's stepper.
 */
export function reanchors(incoming: string, current: string, reported: string | null): boolean {
  if (incoming === current) return false;
  return incoming !== reported;
}
