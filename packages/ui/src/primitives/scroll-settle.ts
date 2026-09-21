/**
 * When a scroller has stopped — as plain arithmetic.
 *
 * **`onMomentumScrollEnd` is not an answer on every target.** It does not fire
 * for a wheel or a trackpad on `react-native-web`, and the end-of-scroll events
 * that *do* arrive there carry a `nativeEvent` with no `contentOffset` at all
 * (`wheel.tsx` found the same thing and times its own settle for the same
 * reason). A rule that asked the platform when scrolling stopped would be
 * right on a phone and silent on the web, which is the worse of the two
 * failures: nothing throws and the date simply never updates.
 *
 * So *stopped* is defined here instead, in one place, as **the offset has not
 * changed for `SETTLE_MS`** — which is true on every target because it is
 * about the offset rather than about the gesture.
 */

/**
 * How still is still.
 *
 * Long enough to outlast the gaps between frames of a decaying fling, short
 * enough that lifting a finger and looking at the strip does not feel like
 * waiting for the screen to catch up. A fling that has decayed below a point
 * per frame is over as far as a reader is concerned.
 */
export const SETTLE_MS = 140;

/**
 * A scroller's state between frames. `at` is the offset, `still` its age in ms.
 *
 * **`at` is `null` before anything has been read, and `0` is not that.** Zero
 * is a real offset — the top of every list — so a state that started there
 * reported a settle about 140ms after mount, with no gesture, no scroll and
 * nobody touching anything. Whatever consumes the report then acts on it: on
 * this screen that wrote a day to the shared date before the reader had done a
 * thing, and seeded the guard that tells a deliberate act from a scroll.
 */
export type Settling = {
  at: number | null;
  still: number;
  /**
   * Whether this scroller has ever actually moved.
   *
   * **A scroller resting where it began has not stopped; it has not started.**
   * Without this the rule below is *the offset has not changed for 140ms*,
   * which is true of a list nobody has touched — so a settle was reported
   * shortly after mount, and whatever consumes one acted on it.
   */
  moved: boolean;
};

/**
 * A scroller a finger has just left.
 *
 * **Already moved, because the drag was the movement.** Seeded as `UNREAD`, a
 * finger lifted *without* a flick never settled: nothing moved after the lift,
 * so there was nothing to have stopped, and the strip stayed between two days.
 * Only a flick snapped — the momentum supplied the movement the rule wanted.
 */
export const LIFTED: Settling = { at: null, still: 0, moved: true };

/** What a scroller that has not been read yet is. */
export const UNREAD: Settling = { at: null, still: 0, moved: false };

/**
 * The state after a frame of `dt` milliseconds, given where the scroller is.
 *
 * Pure so the rule can be tested without a scroller: a hook that owned this
 * arithmetic would only be exercised by something that actually scrolls, which
 * is exactly the thing jsdom does not have.
 */
export function advance(previous: Settling, offset: number, dt: number): Settling {
  "worklet";
  // The first read is a position, never a stop: there is nothing for it to
  // have been still *since*, and nothing has moved yet.
  // `moved` carries over: a state seeded as already-moved (`LIFTED`) settles
  // on stillness alone, which is what a finger lifted without a flick needs.
  if (previous.at === null) return { at: offset, still: 0, moved: previous.moved };
  if (offset !== previous.at) return { at: offset, still: 0, moved: true };
  const step = dt > 0 ? dt : 0;
  return { at: previous.at, still: previous.still + step, moved: previous.moved };
}

/**
 * Whether this frame is the one that settled it.
 *
 * **The crossing, not the state.** A predicate that only said *it is still*
 * would be true on every frame after the scroll stopped, and the caller would
 * write the date sixty times a second while nothing moved. This is true
 * exactly once per stop.
 */
export function justSettled(before: Settling, after: Settling): boolean {
  "worklet";
  if (!after.moved) return false;
  return before.still < SETTLE_MS && after.still >= SETTLE_MS;
}
