/**
 * Where the day strip sits at a given list offset — as plain arithmetic
 * (S04 §7).
 *
 * **Every function here is a worklet, and none of them is a hook.** The strip
 * is driven on the UI thread, so what it calls has to be a worklet; and
 * `.vitest/reanimated.ts` mocks `interpolate` with a no-op, so a strip whose
 * position came out of `interpolate` would have no tested geometry at all.
 * Pulling the arithmetic here gets both: the UI thread runs it, and `vitest`
 * runs it for real. `collapse.ts` is the same shape for the same reason.
 *
 * **The strip is a function of the list, not a reader of its reports.** The
 * version this replaces had the list write the shared date on every scroll
 * frame and the strip re-centre itself in an effect — which made every frame
 * of a gesture a *selection*, with the reload and the step animation a
 * selection carries. S04 §7 has the whole argument; what matters here is that
 * nothing in this file knows what the date is. It maps an offset to an offset.
 */

/**
 * One cell's footprint along the strip — `DayCell`'s own 48 plus the track's
 * gap, and the track's leading padding every position is measured from.
 *
 * Arithmetic rather than measurement: sixty cells reporting their layout
 * during a fling is the cost `DayRibbon`'s memoisation exists to avoid. The
 * lead was measured in Chrome against the running app rather than assumed —
 * cell 0's `offsetLeft` is 16, not 0, and a first version that left it out
 * centred every cell 16px left of where it was asked to.
 */
export const CELL = 48;
export const GAP = 4;
export const STRIDE = CELL + GAP;
export const TRACK_LEAD = 16;

/**
 * Where the strip must sit for the day at `frac` to be under the ring in the
 * middle of a band `band` wide.
 *
 * **`frac` is fractional on purpose, and it is the whole design.** Four tenths
 * of the way down a day puts the strip four tenths of a cell along, so the run
 * slides under the ring at exactly the rate the content moves. The version
 * this replaces took an integer index, which is why it could only ever snap.
 *
 * Clamped at zero at the near end only: the scroller clamps its own far end,
 * and a maximum computed here would need the content width, which is the one
 * number this component never measures.
 */
export function offsetFor(frac: number, band: number): number {
  "worklet";
  if (band <= 0 || Number.isNaN(frac)) return 0;
  const at = TRACK_LEAD + frac * STRIDE + CELL / 2 - band / 2;
  return at <= 0 ? 0 : at;
}

/**
 * How many days past the newest one the strip draws, so the run reaches the
 * band's right edge.
 *
 * **The count is a function of the band, not a number anyone picked.** With
 * the run ending at today, a ring centred on today has nothing to its right on
 * a cold open, and the strip reads as truncated rather than as a position in a
 * run that continues. A fixed week would leave a ragged edge on a small phone
 * and a gap on a large one; measured, the resting state is identical on every
 * device and in every month.
 *
 * `0` for an unmeasured band — never a guess. A strip drawn against a band of
 * zero would put every future cell at the same place.
 */
export function aheadCount(band: number): number {
  "worklet";
  if (band <= 0) return 0;
  // From the centred cell's right edge to the band's right edge.
  const room = band / 2 - CELL / 2;
  if (room <= 0) return 0;
  return Math.ceil(room / STRIDE);
}

/**
 * Where the strip should be, given where the list is.
 *
 * **Two arrays, because the list and the strip do not hold the same days.**
 * `tops` is each of the list's own anchor points in its scrolling content,
 * ascending; `marks` is the strip cell each one stands for. They are separate
 * because `QuietRun` collapses a stretch of empty days into **one row** — the
 * list draws a week of nothing as a single line and the strip draws seven
 * cells — so a position in one is not an index into the other, and the
 * arithmetic that assumed it was is the reason this takes a second array.
 *
 * Between two anchor points the answer is linear, which is what makes
 * scrolling through a tall day move the strip smoothly across one cell rather
 * than jumping at its edge — and makes scrolling through a collapsed run sweep
 * the whole run rather than snapping at its far end.
 *
 * **Clamped at both ends, and `0` for a list with nothing in it.** iOS
 * rubber-bands past the top on every flick, and a negative offset is still the
 * first day; past the last top there is no further day to be fractional
 * between.
 */
export function fracFor(offset: number, tops: readonly number[], marks: readonly number[]): number {
  "worklet";
  const count = tops.length < marks.length ? tops.length : marks.length;
  if (count === 0 || Number.isNaN(offset)) return 0;
  const first = tops[0] ?? 0;
  if (offset <= first) return marks[0] ?? 0;
  const last = count - 1;
  // A linear walk over the anchor points the list has mounted, once per frame
  // on the UI thread. A binary search would be the same answer more slowly at
  // this size.
  for (let i = 0; i < last; i += 1) {
    const from = tops[i];
    const to = tops[i + 1];
    const at = marks[i];
    const next = marks[i + 1];
    if (from === undefined || to === undefined || at === undefined || next === undefined) break;
    if (offset < to) {
      const span = to - from;
      // Two anchor points sharing a top is not a shape the list produces, but
      // a zero span here would divide by it rather than being noticed.
      return span <= 0 ? at : at + ((offset - from) / span) * (next - at);
    }
  }
  return marks[last] ?? 0;
}

/**
 * The same offset, kept inside what the scroller can actually reach.
 *
 * **So that what is asked for is what happens.** A `scrollTo` past the
 * content's end is silently clamped by the scroller, which leaves the strip
 * somewhere nobody asked for — and a component that then compares where it
 * asked to go against where the strip *is* would read its own clamped write as
 * a reader dragging the strip. Clamping here makes the two agree, so the only
 * thing that can move the strip away from its commanded position is a hand.
 *
 * `content` is the track's full width, `0` until it has been reported; an
 * unmeasured content clamps nothing, which is the resting behaviour.
 */
export function offsetWithin(frac: number, band: number, content: number): number {
  "worklet";
  const want = offsetFor(frac, band);
  if (content <= 0 || band <= 0) return want;
  const most = content - band;
  if (most <= 0) return 0;
  return want > most ? most : want;
}

/**
 * The fractional day a strip sitting at `offset` is showing under its ring —
 * `offsetFor` read backwards.
 *
 * What a hand on the strip means, in the same units the list speaks. Without
 * it a dragged strip would have to be sprung back from an offset rather than
 * from a day, and the two would be measured in different things.
 */
export function fracAt(offset: number, band: number): number {
  "worklet";
  if (band <= 0 || Number.isNaN(offset)) return 0;
  return (offset + band / 2 - CELL / 2 - TRACK_LEAD) / STRIDE;
}

/**
 * The time constant the strip catches up over, and the gap below which it
 * does not lag at all.
 *
 * **Reading speed is exact; a fling is damped.** A hard fling covers 2000pt in
 * about 300ms, which on this list is forty days — and forty cells in 300ms is
 * a blur where dates should be. Damped, the same travel is a sweep the eye can
 * follow that lands in the right place. The cost is honest and bounded: for a
 * few hundred milliseconds the strip is behind the list, and it is exact again
 * the moment the list is still.
 */
export const FOLLOW_TAU = 0.12;
export const FOLLOW_EXACT = 1.5;

/**
 * The largest step this will integrate over, in seconds.
 *
 * A backgrounded screen hands back a `dt` of whatever it was away for, and
 * `1 - exp(-90 / tau)` is `1` — which is correct, and correct by accident. The
 * clamp makes it correct on purpose, and stops one enormous frame from being
 * the thing that decides whether the strip is exact.
 */
export const MAX_STEP = 0.1;

/**
 * Where the strip should be drawn this frame, given where it was drawn last.
 *
 * **One formula, and no branch between tracking and lagging.** The obvious
 * spelling is *exact below a threshold, damped above it* — and it snaps: as a
 * fling decays the gap crosses the threshold and the strip jumps the remaining
 * distance, up to `FOLLOW_EXACT` cells of it, which is 78 points. Instead the
 * time constant itself shrinks with the gap, so a strip that is nearly caught
 * up is already tracking exactly and a strip that is a long way behind eases.
 * Continuous by construction, which is what stops the discontinuity existing
 * rather than making it small.
 *
 * The gap stands in for the velocity, and it is the better of the two: it only
 * grows while the target is moving faster than the follower, which is the
 * condition the damping is actually for. Nothing here measures a velocity, so
 * nothing here can disagree with the scroller about what one is.
 *
 * **The taper is on the square, and a linear one was written first and was
 * wrong.** Tapered linearly, a gap of a fifth of a cell — an ordinary reading
 * drag — still closed only 65% of the way in a frame, so the strip visibly
 * trailed the finger at exactly the speed §7 promises is exact. Squared, the
 * time constant collapses fast enough that anything under about half a cell
 * lands within one frame, while the full damping is still there by the time
 * the gap is a cell and a half. The exact band has to be genuinely exact; less
 * damped is not the same thing.
 */
export function follow(shown: number, target: number, dt: number): number {
  "worklet";
  if (Number.isNaN(shown) || Number.isNaN(target)) return target;
  const gap = target - shown;
  const size = gap < 0 ? -gap : gap;
  if (size === 0) return target;
  if (dt <= 0) return shown;
  const step = dt > MAX_STEP ? MAX_STEP : dt;
  const near = size < FOLLOW_EXACT ? size / FOLLOW_EXACT : 1;
  const tau = FOLLOW_TAU * near * near;
  if (tau <= 0) return target;
  const k = 1 - Math.exp(-step / tau);
  if (k >= 1) return target;
  return shown + gap * k;
}
