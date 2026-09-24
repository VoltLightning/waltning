/**
 * How S09's header band folds, in points of page scroll.
 *
 * **Two hand-offs, and the amount is always in one place or the other.** The
 * date leaves the header before the name and amount arrive in it, so the two
 * lines of words never share one place at half strength. The band's own
 * figure is still fading while the header's rises — the ranges overlap — so
 * there is no scroll position with the amount in neither (`fold.test.ts`
 * walks every point and holds the brighter of the two above a floor).
 *
 * Plain functions of the offset, marked as worklets so the same arithmetic
 * runs on the UI thread and in a test.
 */

function ramp(y: number, from: number, to: number): number {
  "worklet";
  if (y <= from) return 0;
  if (y >= to) return 1;
  return (y - from) / (to - from);
}

/** The band's contents — fully there at rest, gone once the header has taken over. */
export function bandOpacity(y: number): number {
  "worklet";
  return 1 - ramp(y, 24, 104);
}

/** The header's date — lifts away first. */
export function dateOpacity(y: number): number {
  "worklet";
  return 1 - ramp(y, 16, 44);
}

/** The header's name and amount — rise in once the date has gone. */
export function titleOpacity(y: number): number {
  "worklet";
  return ramp(y, 44, 72);
}
