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
 *
 * **One title, moved — not two titles cross-faded.** The header used to stack
 * a resting layout over a scrolled one and fade between them, and the fade was
 * the defect: the two met at zero, so at the midpoint of the travel the header
 * was *blank*, and anywhere near it the month sat under 50% opacity. Measured
 * in Chrome, the band where the header showed almost nothing was 14 of the 36
 * points it collapses over. This file now says where each of the three moving
 * parts — the month, the year, the caret — *is* at a given progress, and the
 * component draws each of them exactly once. Nothing fades, so nothing can
 * fade to nothing.
 *
 * **The rest layout is the base, and every offset here is measured from it.**
 * Two reasons, both about the first frame. A header mounts at `scrollY === 0`,
 * so a base that already is the resting shape draws correctly before anything
 * has been measured; and the offsets that need a measured width are the ones
 * that only matter once the reader has scrolled, by which time `onLayout` has
 * long since answered. Base the layout on the collapsed shape instead and the
 * mount flashes the wrong arrangement for a frame.
 */

import { lineHeightFor, space, type } from "../../../tokens.ts";

/** Expanded: the month at `displayTwo`, with the year under it. */
export const EXPANDED_HEIGHT = 84;

/** Collapsed: one 48pt row — the month at `displayThree`, the year beside it. */
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
 * The month's line, and the row every part of the title is centred on.
 *
 * Taken from the type scale rather than written down, so a change to
 * `displayTwo` moves the header with it instead of leaving this 28 behind.
 */
export const MONTH_ROW = lineHeightFor("displayTwo");

/** The year's line at the size it is *laid out* at — `displayThree`, its larger end. */
export const YEAR_ROW = lineHeightFor("displayThree");

/**
 * **Every scale here is ≤ 1, because each part is laid out at its larger end
 * and shrunk from there.** Type scaled up is type rasterised at one size and
 * stretched to another; scaled down it only ever loses detail it had. So the
 * month is drawn at `displayTwo` and shrinks as the header closes, and the
 * year is drawn at `displayThree` and is *already* shrunk at rest — a caption's
 * size, though not a caption's weight: one element carries one weight, and
 * `displayThree`'s 600 is what it keeps. That is the cost of the year being a
 * thing that moves rather than two things that trade places.
 */
export const MONTH_SHUT_SCALE = type.displayThree.fontSize / type.displayTwo.fontSize;

/** The year at rest is a caption; collapsed it is the month's own size. */
export const YEAR_REST_SCALE = type.caption.fontSize / type.displayThree.fontSize;

/** The caret is drawn at its resting size and shrinks with the month. */
export const CARET_REST = 16;
export const CARET_SHUT = 14;
export const CARET_SHUT_SCALE = CARET_SHUT / CARET_REST;

/** Between the month and the year, and between the year and the caret. */
export const TITLE_GAP = space.sm;

/**
 * The title block's own vertical padding — a 44pt target around a 28pt row.
 *
 * Static, and it has to be: the row's position inside the block is what
 * `titleTop` is stated in, so a padding that moved would move the title twice.
 * `space.md` is the value that makes 28 into 44 and still leaves the target
 * inside the collapsed header rather than 2pt past its edge.
 */
export const TITLE_PAD = space.md;

/**
 * The slot the year occupies under the month at rest — a caption's line, which
 * is the size the year is drawn at up there.
 *
 * **The caption's line height, not the drawn height of a scaled `displayThree`.**
 * They are within half a point of each other and the half point is visible: it
 * is the difference between the title sitting where it always has and sitting
 * one hair high, which is a diff in every baseline for no reason anyone could
 * name later.
 */
export const YEAR_SLOT = lineHeightFor("caption");

/** The gap under the year at rest, and under the month once it has closed. */
export const TITLE_REST_BOTTOM = space.xs;
export const TITLE_SHUT_BOTTOM = space.lg;

/**
 * `0` fully expanded, `1` fully collapsed.
 *
 * **A negative offset is still 0.** iOS rubber-bands past the top on every
 * flick, and without the clamp the header would be asked to draw itself taller
 * than expanded — the one state the layout is not built for.
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

/**
 * How much of its height the chrome has **not yet** given back, in points.
 *
 * **This is what stops the header from resizing the page it is reading.** The
 * chrome sat in the flow above the pager, so its animated height was the
 * pager's height: measured in Chrome, collapsing the header grew the scroll
 * viewport from 640 to 676 in lockstep with it. That is a loop — the offset
 * sets the header's height, the height sets the viewport, and the viewport
 * sets the largest offset the scroller will hold, so a page whose content is
 * within 36pt of a screenful gets scrolled *back* by its own header and the
 * bar flickers in and out for as long as you hold the gesture. It is also a
 * full layout of four mounted pages every frame, which is the lag.
 *
 * The fix is that the chrome carries a negative bottom margin of exactly what
 * it has not yet given up. Its height and its margin then always sum to the
 * collapsed height, so the pager's *layout* box is the same box at every
 * offset, and the pager is moved down by the same number as a transform. The
 * loop is gone by construction, and measurably: the viewport reads 732 at both
 * ends of the travel where it used to read 640 and 676.
 *
 * **What this is not is zero layout work.** The margin is a layout property
 * written every frame, alongside the height it cancels, so the chrome still
 * commits per frame — what stops is the *pager* being re-measured, and the
 * four mounted pages under it. That the pages are now skipped rests on the
 * layout engine returning cached geometry for a subtree whose constraints did
 * not change; it is the reason the change is worth making and it has not been
 * profiled. A chrome with a static height and its visible band drawn by an
 * absolutely positioned child would have no animated layout property at all;
 * that is the next thing to measure if this is still not fast enough.
 *
 * One function for both because they are one fact: the margin takes it away
 * and the transform gives it back, and two constants that had to stay equal
 * would eventually not be.
 */
export function chromeSlack(progress: number): number {
  "worklet";
  return COLLAPSE_TRAVEL * (1 - progress);
}

/** The month's size, from `displayTwo` at rest to `displayThree` collapsed. */
export function monthScale(progress: number): number {
  "worklet";
  return 1 + (MONTH_SHUT_SCALE - 1) * progress;
}

/**
 * Where the year's travel changes from *out* to *up*.
 *
 * **The year slides clear of the month before it rises, and the two never
 * happen at once.** Moved on one curve it cut straight through the month:
 * halfway along it was two thirds of the way up into the month's line and only
 * a third of the way across it, so `2026` sat on top of `September` for a
 * third of the travel — visible in Chrome at every offset between .45 and .9.
 * Sequencing is not a nicety here, it is the whole guarantee: while the year is
 * still under the month it cannot collide with it whatever its horizontal
 * position, and once it has cleared the month's right edge it cannot collide
 * whatever its height. The invariant is checked at every offset in
 * `collapse.test.ts`, because "they do not overlap" is not something reading
 * two interpolations tells you.
 */
export const YEAR_LIFTS = 0.5;

/**
 * **Both phases take `monthWidth`, and both are zero without one.**
 *
 * The year's whole journey is *one gap past the month's drawn edge*, and that
 * edge is a measured number — a month's width is its word in the reader's
 * language, and `wrzesień` is not `September`. `onLayout` is the only thing
 * that knows it and `onLayout` is not reliable in this tree: `pager.tsx`
 * records it failing silently on the scroller and `page-tabs.tsx` says the
 * same. So `0` here means *not measured*, never *a month zero points wide*,
 * and an unmeasured header keeps the shape it can draw without measuring —
 * the resting one, which is also the shape it mounts in.
 *
 * Read `0` as a width instead and the collapsed year lands at x = 6, on top of
 * the month, with the caret inside it: not a header that looks unmeasured, a
 * header that looks broken, with nothing thrown and nothing logged. The gate
 * is here rather than at each call site because every part of the year's
 * travel — where it is, how big it is, and how much room the title leaves
 * under it — is a function of one of these two, so gating them gates all of it.
 */
export function yearSlide(progress: number, monthWidth: number): number {
  "worklet";
  if (monthWidth === 0) return 0;
  if (progress >= YEAR_LIFTS) return 1;
  return progress / YEAR_LIFTS;
}

/** How far the year has risen onto the month's row. `0` until it is clear. */
export function yearLift(progress: number, monthWidth: number): number {
  "worklet";
  if (monthWidth === 0) return 0;
  if (progress <= YEAR_LIFTS) return 0;
  return (progress - YEAR_LIFTS) / (1 - YEAR_LIFTS);
}

/**
 * The year's size, from a caption at rest to the month's own size collapsed.
 *
 * **On the lift, not the slide — the header clips, and a year that grew while
 * it was still under the month grew straight through the bottom edge.** The
 * room `titleTop` leaves under the month's row is the caption's slot; grow the
 * year to `displayThree` before it has left that slot and it wants 22pt of a
 * 15.5pt space. Sized on the slide it did exactly that: at the midpoint of the
 * travel 7 of its 22 points were outside the header's `overflow: hidden`, and
 * the digits were cut above their baseline for a third of the travel.
 *
 * On the lift the two are one motion — the year grows as it rises, and it only
 * rises once it is beside the month rather than beneath it, where the space it
 * is growing into is the month's own row.
 */
export function yearScale(progress: number, monthWidth: number): number {
  "worklet";
  return YEAR_REST_SCALE + (1 - YEAR_REST_SCALE) * yearLift(progress, monthWidth);
}

/** The caret's size. It belongs to the month and shrinks on the same curve. */
export function caretScale(progress: number): number {
  "worklet";
  return 1 + (CARET_SHUT_SCALE - 1) * progress;
}

/**
 * Where the title row's top sits inside the header.
 *
 * The title is anchored to the header's *bottom*, not centred in it: the
 * search button and the stepper sit in the bottom 48pt at both ends of the
 * travel, and a month that drifted up away from them would stop reading as
 * their row.
 *
 * **What it is anchored *by* is what changes.** At rest the year hangs under
 * the month, so what sits below the row is the year's slot and the gap under
 * it; collapsed the year is up on the row and what sits below it is the gap
 * that centres a 28pt line in the 48pt row the controls keep. The two are
 * different numbers because they are two different things, and interpolating
 * between them is what puts the title exactly where each shape wants it —
 * rather than at one offset that is right at neither end.
 */
export function titleTop(progress: number, monthWidth: number): number {
  "worklet";
  // **On the lift, for the same reason `yearScale` is.** The room under the row
  // *is* the year's slot, so it may only be taken back once the year has left
  // it. Interpolated on raw progress it was reclaimed while the year was still
  // sitting in it, and the year was pushed through the header's bottom edge.
  const lift = yearLift(progress, monthWidth);
  const under = (1 - lift) * (TITLE_REST_BOTTOM + YEAR_SLOT) + lift * TITLE_SHUT_BOTTOM;
  return headerHeight(progress) - MONTH_ROW - under;
}

/**
 * How far right the year has travelled, in points.
 *
 * At rest it is under the month at the left edge; collapsed it stands just
 * past the month's *drawn* right edge — which is the month's laid-out width
 * shrunk by however far the collapse has got. So the year does not merely
 * arrive beside the month at the end: it tracks the month's edge the whole way
 * there, so from the moment it has finished sliding the space between the two
 * is one gap and stays one gap while the month goes on shrinking.
 *
 * `monthWidth` is the month's laid-out width — measured, because a month's
 * width is its own word in the reader's language and no constant can know it.
 *
 * **Zero means *not measured yet*, and an unmeasured header stays at rest.**
 * `onLayout` is not reliable in this tree — `pager.tsx` records it failing
 * silently on the scroller, and `page-tabs.tsx` says the same. Treat a zero
 * width as a real width and the collapsed year lands at x = 6, on top of the
 * month, with the caret inside it as well: the header does not look
 * unmeasured, it looks broken, and nothing errors. So the whole travel is
 * gated on having a number — the header simply does not collapse its title,
 * which is the shape it already draws and the one state that is correct
 * without measuring anything.
 */
export function yearShiftX(progress: number, monthWidth: number): number {
  "worklet";
  return yearSlide(progress, monthWidth) * (monthWidth * monthScale(progress) + TITLE_GAP);
}

/**
 * How far the year has travelled vertically, in points — negative is upward.
 *
 * Stated as *where its centre wants to be*, minus where the layout put it,
 * because the two ends are described by different things: at rest the year is
 * a caption sitting directly under the month, and collapsed it is centred on
 * the month's own row. Interpolating the centre and subtracting the base is
 * the only spelling of that which stays right when either line height changes.
 *
 * Takes `monthWidth` for the one reason `yearShiftX` does: a year that rose
 * without knowing how far right to go would rise onto the month.
 */
export function yearShiftY(progress: number, monthWidth: number): number {
  "worklet";
  const base = MONTH_ROW + YEAR_ROW / 2;
  // Pinned by its **top**, not its centre, for as long as it is under the
  // month: the year grows as it goes, and a centre held still grows upward
  // into the month's line by the half of that growth.
  const rest = MONTH_ROW + (YEAR_ROW * yearScale(progress, monthWidth)) / 2;
  const shut = MONTH_ROW / 2;
  return rest + (shut - rest) * yearLift(progress, monthWidth) - base;
}

/**
 * How far right the caret has travelled.
 *
 * The caret's job is to sit at the end of the title, whatever the title
 * currently is: after the month at rest, after the year once the year has
 * joined the row. `yearWidth` is `0` where the period has no year to show —
 * Months, where the label is already `2026` — and the caret then simply
 * follows the month's shrinking edge.
 */
export function caretShiftX(progress: number, monthWidth: number, yearWidth: number): number {
  "worklet";
  const shrink = monthWidth * (monthScale(progress) - 1);
  if (yearWidth === 0) return shrink;
  const slide = yearSlide(progress, monthWidth);
  return shrink + slide * (yearWidth * yearScale(progress, monthWidth) + TITLE_GAP);
}

/**
 * Where the stepper is in its arrival, `0` absent and `1` fully there.
 *
 * **It waits, and then it comes.** The arrows are the one part of the header
 * that is not a smaller version of something already on screen — they are new,
 * and a new control drifting in from the top of the travel reads as a fade
 * rather than as an arrival. Nothing else in the header fades, so this is the
 * only opacity in the file, and it is on a control rather than on a word.
 */
export const STEPPER_ARRIVES = 0.55;

export function stepperArrival(progress: number): number {
  "worklet";
  if (progress <= STEPPER_ARRIVES) return 0;
  return (progress - STEPPER_ARRIVES) / (1 - STEPPER_ARRIVES);
}

/**
 * How far into its arrival the stepper becomes real.
 *
 * **Half, not the first pixel of opacity.** `arrival > 0` was the obvious
 * spelling and it did not fix the defect it was written for, it moved it: the
 * stepper became tappable and audible at an opacity of two parts in a billion,
 * and stayed under 4% for another two thirds of a point of scroll. A reader
 * parked there is offered *previous month* over an arrow that is not drawn.
 * Half the arrival is the first offset at which the control is unambiguously
 * on screen.
 */
export const STEPPER_IS_REAL_AT = 0.5;

/**
 * Whether the stepper is real — tappable, and in the accessibility tree.
 *
 * The arrival is continuous and this is not: a control at 4% opacity is
 * invisible and still tappable. Nothing else in the header needs the boolean
 * any more, because nothing else is drawn twice — the month, the year and the
 * caret are each one element that moves, so no reader can hear the month
 * twice and no invisible copy can take a tap.
 */
export function stepperIsReal(progress: number): boolean {
  "worklet";
  return stepperArrival(progress) >= STEPPER_IS_REAL_AT;
}
