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

/**
 * How long after one of this component's own writes a movement is still
 * presumed to be that write arriving, in milliseconds.
 *
 * **Because on a phone `scrollTo` is asynchronous.** The scroller reports where
 * it is through scroll events, and they trail the write that caused them — by a
 * frame or two for a plain write, by the whole animation for an animated one.
 * The first version asked *is the strip where I put it?*, which on the web is
 * a fair question (the write is synchronous) and on a device is always *no*
 * while the list is scrolling: the strip detached itself mid-scroll, every
 * scroll, and stopped following the list. It shipped because every suite that
 * could see it runs in a browser.
 *
 * So the question is asked the other way round: *have I written recently?* If
 * so, movement is mine. Only a strip that moves after this component has been
 * silent for longer than any of its own animations has been moved by a hand.
 */
export const QUIET_MS = 500;

/** What a frame can tell the strip about who moved what. */
export type Frame = {
  /** The list started moving this frame, rather than continuing to glide. */
  listJumped: boolean;
  /** The strip's own offset changed since the last frame. */
  drifted: boolean;
  /** Milliseconds since this component last wrote to the strip's scroller. */
  sinceWrite: number;
};

export function grip(before: Grip, frame: Frame): Grip {
  "worklet";
  // A finger outranks the list, and the list moves during a strip drag anyway.
  if (frame.listJumped && !before.dragging) return { dragging: false, detached: false };
  const byHand = frame.drifted && frame.sinceWrite > QUIET_MS;
  return { dragging: before.dragging, detached: before.detached || byHand };
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

/** The least time between two taps — the haptic engine's own floor, roughly. */
export const TICK_GAP_MS = 30;

/**
 * Whether a day passing under the ring should tap.
 *
 * **Every day a hand sends past the ring, coasting included** — each cell is
 * a snap point, and a snap point that passes in silence is the picker feeling
 * broken. This was narrowed to *finger down only* once, on the argument that
 * a long coast buzzes; on a device that reads as the feedback cutting out the
 * moment you let go, which is worse. The floor between taps is what keeps a
 * fast coast a purr rather than a rattle, the way the system pickers do it.
 *
 * Never for a strip the *list* is driving: scrolling the ledger is not this
 * gesture, and forty taps through a fling of the list is a notification.
 */
export function ticksNow(hold: Grip, sinceTick: number): boolean {
  "worklet";
  return hold.detached && sinceTick >= TICK_GAP_MS;
}
