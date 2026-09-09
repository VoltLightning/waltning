/**
 * Where the marker sits and how strongly a name is inked, at a given point in
 * a swipe (S04 §3).
 *
 * **Worklets, and not a hook.** The marker's style runs on the UI thread, so
 * what it calls has to be a worklet — and `.vitest/reanimated.ts` mocks
 * `interpolate` with a no-op, so a position that came out of `interpolate`
 * would have no tested geometry at all. Pulled here, the UI thread runs it and
 * `vitest` runs it for real. `collapse.ts` says the same thing about the
 * header, and for the same reason.
 *
 * **Everything is a proportion, never a pixel.** The tabs are `flex: 1`, so a
 * slot is exactly `100 / count`% of the row on any device — and `onLayout`
 * does not fire in this tree (`pager.tsx` records where that was learned). A
 * measurement that can silently be zero is the wrong thing for a marker to
 * depend on; a proportion cannot be.
 */

/** One slot's width, as a percentage of the row. */
export function slotWidth(count: number): `${number}%` {
  "worklet";
  if (count <= 0) return "100%";
  return `${100 / count}%`;
}

/**
 * How far the marker has travelled, as a percentage of **its own width**.
 *
 * The slot is exactly one tab wide, so one page of progress is one slot of
 * travel and nothing has to be measured. `translateX` of a percentage is
 * resolved against the element itself, which is what makes that true.
 */
export function markerShift(progress: number): `${number}%` {
  "worklet";
  return `${clampProgress(progress) * 100}%`;
}

/**
 * A swipe that has run past either end.
 *
 * iOS rubber-bands at both edges and a browser's overscroll does the same, so
 * the offset can be negative or past the last page. The marker stops at the
 * ends: a bar that slid off the row would be a bar drawn where no tab is.
 */
function clampProgress(progress: number): number {
  "worklet";
  if (Number.isNaN(progress) || progress <= 0) return 0;
  return progress;
}

/**
 * How near the swipe is to one tab: `1` on it, `0` a page away or more.
 *
 * The tint reads this rather than a boolean, which is what leaves two names
 * half-inked mid-swipe instead of one snapping to the other when the gesture
 * ends.
 */
export function tabNearness(progress: number, index: number): number {
  "worklet";
  if (Number.isNaN(progress)) return index === 0 ? 1 : 0;
  const distance = Math.abs(progress - index);
  return distance >= 1 ? 0 : 1 - distance;
}

/** The three stops a tab's ink interpolates between: muted, full, muted. */
export function tintRange(index: number): readonly [number, number, number] {
  "worklet";
  return [index - 1, index, index + 1];
}
