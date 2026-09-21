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

/** The least the track is ever inset by — the screen's own gutter. */
export const TRACK_MIN = 16;

/**
 * The track's padding, either end: **enough that the first and last cells can
 * reach the middle of the band.**
 *
 * **Both ends, and only one of them used to be padded.** `aheadCount` generates
 * days past today so the *far* end is reachable; nothing did the same for the
 * near end, so the oldest cells could not be centred at all — the track had no
 * room left of them, `offsetFor` clamped at zero, and the ring sat on a day
 * three newer than the one the list was showing (nine newer on a 1024-wide
 * band). Padding is the honest fix for both ends: it makes every cell
 * centrable, which makes `offsetFor` exactly invertible, which is what lets
 * the component tell its own clamped write from a hand on the strip.
 */
export function trackLead(band: number): number {
  "worklet";
  const centred = band / 2 - CELL / 2;
  return centred > TRACK_MIN ? centred : TRACK_MIN;
}

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
  const at = trackLead(band) + frac * STRIDE + CELL / 2 - band / 2;
  return at <= 0 ? 0 : at;
}

/**
 * How many days past the newest one the strip draws, so the run reaches the
 * band's right edge.
 *
 * **The count is a function of the band, not a number anyone picked.** With
 * the run ending at today, a ring centred on today has the track's own padding
 * to its right on a cold open, and the strip reads as truncated rather than as
 * a position in a run that continues. A fixed week would leave a ragged edge on
 * a small phone and a gap on a large one; measured, the resting state is
 * identical on every device and in every month.
 *
 * It is no longer what makes the far end *reachable* — `trackLead` pads both
 * ends for that — so this is now only about what the reader sees there: real
 * days rather than blank track.
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
 * What the strip needs to know about the list it follows.
 *
 * **Declared here rather than imported.** `list-geometry.ts` produces it, and
 * it lives in `packages/client` because it is a derived model; this package
 * may not import that one (`architecture/11` — they are siblings over `core`).
 * So the strip states the shape it *reads*, the screen passes the richer value
 * it holds, and the two are joined structurally at the one place both are in
 * scope. The `dates` half of the geometry is deliberately absent: naming a day
 * is the list's business and this file has no opinion about it.
 */
export type StripPlacement = {
  readonly tops: readonly number[];
  readonly marks: readonly number[];
};

/** A strip with no list behind it yet. */
export const EMPTY_PLACEMENT: StripPlacement = { tops: [], marks: [] };

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
 * How much of a day has to be left at the top of the list for it still to be
 * *the day the reader is on*, in points — about a day's heading and most of a
 * row.
 */
export const SEEN_LEAD = 72;

/** How close to a block's own top counts as resting on it. */
export const AT_TOP_SLACK = 2;

/**
 * Which day block the reader is *looking at* — the index into `tops`.
 *
 * **Not the block the offset is inside, which is what this first was.** The
 * last sliver of the 24th under the top edge is, arithmetically, the 24th; and
 * everything a person can actually read on that screen is the 23rd. Reported
 * from a phone as *I end up on August 23rd and the selected one is the 24th* —
 * off by one, every time the list stopped near the end of a day. So a day that
 * has less than `SEEN_LEAD` left on screen has been scrolled past, and the day
 * below it is the one being read.
 *
 * **Except a block the list is resting exactly on top of**, however short:
 * that is where a tap on a day puts the list, and a quiet day is only one line
 * tall — by the rule above a tap on it would select the day *after* it.
 *
 * The last entry of `tops` is `list-geometry.ts`'s sentinel — a position, not
 * a day — so nothing is ever advanced onto it.
 */
export function blockAt(offset: number, tops: readonly number[]): number {
  "worklet";
  const count = tops.length;
  if (count === 0 || Number.isNaN(offset)) return -1;
  let inside = count - 1;
  if (offset <= (tops[0] ?? 0)) inside = 0;
  else {
    for (let i = 0; i < count - 1; i += 1) {
      const to = tops[i + 1];
      if (to === undefined) break;
      if (offset < to) {
        inside = i;
        break;
      }
    }
  }
  const top = tops[inside] ?? 0;
  if (offset - top <= AT_TOP_SLACK) return inside;
  const next = tops[inside + 1];
  if (next !== undefined && inside + 1 < count - 1 && next - offset <= SEEN_LEAD) return inside + 1;
  return inside;
}

/**
 * The strip cell of the day the reader is looking at — `blockAt`, in cells.
 *
 * **What the ring lands on when the list stops, and the same rule the date is
 * named by**, so the two agree by construction. They are two answers to one
 * question and were once allowed to differ: the screen showed a ring on one
 * day and a Calendar marked on the next.
 */
export function markOf(offset: number, tops: readonly number[], marks: readonly number[]): number {
  "worklet";
  const at = blockAt(offset, tops);
  if (at < 0) return 0;
  return marks[at < marks.length ? at : marks.length - 1] ?? 0;
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
  return (offset + band / 2 - CELL / 2 - trackLead(band)) / STRIDE;
}

/**
 * The cell a strip sitting at `offset` has come to rest nearest.
 *
 * **What a snap snaps to**, and what decides when the tick fires. Clamped to
 * the run the strip actually holds: `fracAt` is unbounded, and the first and
 * last few cells cannot be centred at all — the track has no room either side
 * of them — so rounding its answer alone would name a cell that does not
 * exist and snap the strip to an offset it cannot reach.
 */
export function nearestCell(offset: number, band: number, count: number): number {
  "worklet";
  if (count <= 0) return 0;
  const at = Math.round(fracAt(offset, band));
  if (at < 0) return 0;
  const last = count - 1;
  return at > last ? last : at;
}

/**
 * The time constant the strip catches up over, and the gap below which it
 * does not lag at all.
 *
 * **Reading speed is exact; a fling is damped.** A hard fling covers about
 * 2000pt in 300ms, which on this list is twenty days of one-row days and
 * several times that across a collapsed run — either way, more cells per
 * second than an eye can read. Damped, the same travel is a sweep the eye can
 * follow that lands in the right place. The cost is honest and bounded: for a
 * few hundred milliseconds the strip is behind the list, and it is exact again
 * the moment the list is still.
 */
export const FOLLOW_TAU = 0.12;

/**
 * The speed, in cells per second, below which the strip does not lag at all.
 *
 * **A speed, not a gap — and the difference is the whole of a real defect.**
 * The taper used to shrink with the *gap*, and the gap a given drag produces
 * depends on the frame interval: the closed loop's equilibrium then had a
 * fold, so a small change in speed or frame rate moved the lag by two orders
 * of magnitude. At 60fps a 10% speed increase multiplied the lag by 64, and at
 * 30fps — an ordinary mid-range Android, or a loaded browser tab — the band
 * this very constant is supposed to make exact lagged by a cell and a half for
 * the whole drag. Tapering on the target's own speed takes `dt` out of the
 * decision entirely: fifteen cells a second is fifteen cells a second at any
 * frame rate.
 */
export const EXACT_SPEED = 15;

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
 * Where the strip should be drawn this frame, given where it was drawn last
 * and how fast the day it is following is moving.
 *
 * **Tapered on the target's speed, and a gap-tapered version was written first
 * and was wrong.** Below `EXACT_SPEED` there is no damping at all, so a
 * reading drag is exact by construction rather than by arithmetic that happens
 * to converge; above it the time constant ramps in over another `EXACT_SPEED`,
 * so there is no step at the threshold and no cliff beyond it.
 *
 * Tapering on the *gap* instead — the obvious spelling, and the one this
 * replaces — looked continuous and was not, because the gap a drag produces is
 * itself a function of the frame interval. The closed loop had a fold: a 10%
 * change in speed moved the steady-state lag by 64x at 60fps, and at 30fps the
 * band the tests called exact lagged a cell and a half for the whole gesture.
 * A follower whose behaviour depends on the device's frame rate is not damped,
 * it is unpredictable.
 *
 * `speed` is in cells per second and is the caller's to measure, because only
 * the caller knows what the target did last frame.
 */
export function follow(shown: number, target: number, speed: number, dt: number): number {
  "worklet";
  if (Number.isNaN(shown) || Number.isNaN(target)) return target;
  const gap = target - shown;
  if (gap === 0) return target;
  if (dt <= 0) return shown;
  const step = dt > MAX_STEP ? MAX_STEP : dt;
  const fast = Number.isNaN(speed) ? 0 : speed < 0 ? -speed : speed;
  // Nothing to damp: reading speed, and the strip is simply where the day is.
  if (fast <= EXACT_SPEED) return target;
  const over = (fast - EXACT_SPEED) / EXACT_SPEED;
  const tau = FOLLOW_TAU * (over > 1 ? 1 : over);
  if (tau <= 0) return target;
  const k = 1 - Math.exp(-step / tau);
  if (k >= 1) return target;
  return shown + gap * k;
}

/**
 * The track's full width — arithmetic, where it used to be measured.
 *
 * **`onContentSizeChange` is not dependable enough to clamp by.** The track's
 * padding depends on the band, so its width changes one layout after the band
 * is known — and `react-native-web` does not report that second size. The
 * clamp then held the width of a track with no padding: on a 1216pt band the
 * strip stopped 1,100pt short of the day it was sent to, and stayed there.
 * Invisible at phone width, where the two widths are a few points apart. The
 * cells are a fixed size, so the width is known the moment the band is.
 *
 * `0` for an unmeasured band or an empty run, which clamps nothing.
 */
export function trackWidth(band: number, count: number): number {
  "worklet";
  if (band <= 0 || count <= 0) return 0;
  return 2 * trackLead(band) + count * STRIDE - GAP;
}
