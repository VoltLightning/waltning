/**
 * The shape of S04's header at a given scroll offset — as plain arithmetic
 * (S04 §3).
 *
 * **Every one of these is a worklet, and none of them is a hook.** Reanimated
 * runs the header's style on the UI thread, so the functions it calls have to
 * be worklets; and `.vitest/reanimated.ts` mocks `interpolate` with a no-op,
 * so a component whose shape came out of `interpolate` would have no tested
 * geometry at all. Pulling the arithmetic here gets both: the UI thread runs
 * it, and `vitest` runs it for real.
 */

/** Expanded: the title at `displayTwo`, with the year under it. */
export const EXPANDED_HEIGHT = 84;

/** Collapsed: one 48pt row — the title at `displayThree`, the stepper beside it. */
export const COLLAPSED_HEIGHT = 48;

/**
 * The scroll distance the collapse is spread over.
 *
 * **It is the height the header gives up, not a round number.** Tie the travel
 * to the movement and the header rises at exactly the speed of the content
 * beneath it, so the two read as one sheet sliding under another rather than
 * as two things moving at different rates — and the constant cannot drift out
 * of step with the heights the day one of them changes.
 */
export const COLLAPSE_TRAVEL = EXPANDED_HEIGHT - COLLAPSED_HEIGHT;

/**
 * Where the two layers hand over.
 *
 * They cross at the midpoint rather than each fading across the whole travel:
 * two layouts at half opacity are two ghosts, and the pair is legible only if
 * one has finished leaving before the other starts arriving.
 */
export const HANDOVER = 0.5;

/** How far the large title lifts as it goes, in points. */
export const REST_LIFT = -10;

/** How far the small title settles as it lands, in points. */
export const SHUT_SETTLE = 8;

/**
 * `0` fully expanded, `1` fully collapsed.
 *
 * **A negative offset is still 0.** iOS rubber-bands past the top on every
 * flick, and without the clamp the header would be asked to draw itself taller
 * than expanded — the one state neither layout is laid out for.
 */
export function collapseProgress(offset: number): number {
  "worklet";
  if (Number.isNaN(offset) || offset <= 0) return 0;
  if (offset >= COLLAPSE_TRAVEL) return 1;
  return offset / COLLAPSE_TRAVEL;
}

/** The container's height at `progress`. This is what moves the page. */
export function headerHeight(progress: number): number {
  "worklet";
  return EXPANDED_HEIGHT + (COLLAPSED_HEIGHT - EXPANDED_HEIGHT) * progress;
}

/** The resting layout's opacity — gone by the handover. */
export function restOpacity(progress: number): number {
  "worklet";
  if (progress >= HANDOVER) return 0;
  return 1 - progress / HANDOVER;
}

/** The scrolled layout's opacity — nothing until the handover. */
export function shutOpacity(progress: number): number {
  "worklet";
  if (progress <= HANDOVER) return 0;
  return (progress - HANDOVER) / (1 - HANDOVER);
}

/**
 * The two titles' travel.
 *
 * One rises as it leaves and the other settles as it lands, so the pair reads
 * as one title changing size rather than as a swap of two.
 */
export function restLift(progress: number): number {
  "worklet";
  return REST_LIFT * progress;
}

export function shutSettle(progress: number): number {
  "worklet";
  return SHUT_SETTLE * (1 - progress);
}

/**
 * Which layout owns the pointer and the accessibility tree at `progress`.
 *
 * The opacity is continuous and this is not: a control at 4% opacity is
 * invisible and still tappable, and a screen reader walking both layouts hears
 * the month twice. The boolean follows the handover, so exactly one layout is
 * ever real.
 */
export function isCollapsed(progress: number): boolean {
  "worklet";
  return progress >= HANDOVER;
}
