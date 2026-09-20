/**
 * Who is driving the day strip — as a state machine, in plain arithmetic.
 *
 * **Three reviews found three bugs in this one decision**, and all three were
 * invisible to every suite: it lives in a Reanimated frame callback, and jsdom
 * has neither frames nor a scroller to move. So the decision is not in the
 * frame callback any more. It is here, where `vitest` runs it for real, and
 * the component is left holding only the parts that genuinely need a device.
 * `collapse.ts` and `scrub.ts` are the same shape for the same reason.
 *
 * The three, in the order they were found:
 *
 *  - A `scrollTo` the scroller clamped looks exactly like a hand, so the strip
 *    detached with nobody touching it and stayed that way.
 *  - The list glides on after a fling, and every frame of the glide overruled
 *    a hand that had since arrived.
 *  - The strip is a horizontal scroller inside a page that scrolls
 *    vertically, so a real thumb drag moves the list by a point or two as
 *    well — which counted as the reader taking the list back, mid-gesture.
 *    On a phone: drag from the 20th toward the 16th, and the strip snaps home
 *    to the 20th under your thumb.
 *
 * What they have in common is that *the strip moved* and *the list moved* are
 * both true far more often than they mean anything, and the questions worth
 * asking are narrower: was this move ours, and is a finger down.
 */

/** Who is driving, between frames. */
export type Grip = {
  /** A finger is on the strip **right now** — not merely that one was. */
  dragging: boolean;
  /**
   * The list does not get to place the strip.
   *
   * Outlives the gesture on purpose (S04 §7: *lifting the finger changes
   * nothing*). What ends it is the reader going back to the list.
   */
  detached: boolean;
};

export const LOOSE: Grip = { dragging: false, detached: false };

/** What a frame can tell the strip about who moved what. */
export type Frame = {
  /** The list started moving this frame, rather than continuing to glide. */
  listJumped: boolean;
  /** The strip's own offset changed since the last frame. */
  drifted: boolean;
  /**
   * The last offset this component asked for was one the scroller could
   * actually reach — so a difference from it is somebody else's doing.
   *
   * **Without this a clamped write is a hand.** The strip's content grows as
   * the list pages, and until `onContentSizeChange` has reported there is no
   * clamping at all, so the first write on a cold open ran past the end.
   */
  reachable: boolean;
  /** The strip is further from where it was put than a rounding error. */
  moved: boolean;
};

export function grip(before: Grip, frame: Frame): Grip {
  "worklet";
  // A finger outranks the list, and the list moves during a strip drag anyway.
  const detached =
    frame.listJumped && !before.dragging
      ? false
      : before.detached || (frame.drifted && frame.reachable && frame.moved);
  return { dragging: before.dragging, detached };
}

export function takeHold(): Grip {
  "worklet";
  return { dragging: true, detached: true };
}

export function letGo(before: Grip): Grip {
  "worklet";
  // The gesture ends; the detach does not.
  return { dragging: false, detached: before.detached };
}

/**
 * Whether the strip may settle onto a cell this frame.
 *
 * **Never under a finger.** Measured through the gesture, a pause mid-drag was
 * a settle: the strip animated itself to the nearest cell while the thumb was
 * still moving, which reads as the strip jumping off on its own — the 10th, on
 * the way from the 20th to the 16th.
 */
export function snapsNow(hold: Grip, settled: boolean, already: boolean): boolean {
  "worklet";
  return !hold.dragging && !already && settled;
}

/**
 * Whether a day crossing should tap.
 *
 * A tap is something a finger does, so the momentum after a flick does not
 * tap — thirty cells of coasting is a notification where a texture was wanted.
 * `first` is a crossing with nothing to compare against, which is not one.
 */
export function ticksNow(hold: Grip, first: boolean): boolean {
  "worklet";
  return hold.dragging && !first;
}
