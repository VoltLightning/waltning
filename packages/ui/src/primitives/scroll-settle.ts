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

/** A scroller's state between frames. `at` is the offset, `still` its age in ms. */
export type Settling = { at: number; still: number };

/**
 * The state after a frame of `dt` milliseconds, given where the scroller is.
 *
 * Pure so the rule can be tested without a scroller: a hook that owned this
 * arithmetic would only be exercised by something that actually scrolls, which
 * is exactly the thing jsdom does not have.
 */
export function advance(previous: Settling, offset: number, dt: number): Settling {
  "worklet";
  if (offset !== previous.at) return { at: offset, still: 0 };
  const step = dt > 0 ? dt : 0;
  return { at: previous.at, still: previous.still + step };
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
  return before.still < SETTLE_MS && after.still >= SETTLE_MS;
}
