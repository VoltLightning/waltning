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
 * The floor while the *list* is what moves the strip.
 *
 * **Scrolling the ledger taps too — it was decided once that it should not,
 * and a device overruled that.** The argument was that forty days through one
 * fling is a notification rather than a texture; what it felt like in the hand
 * was *no haptics*, because scrolling the list is how this strip is moved
 * nearly all of the time. The longer floor is what is left of the argument: a
 * reading scroll ticks every day, and a fling is thinned to a purr.
 */
export const LIST_TICK_GAP_MS = 70;

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
 * A strip the *list* is driving taps as well, on a longer floor — see
 * `LIST_TICK_GAP_MS`.
 */
export function ticksNow(hold: Grip, sinceTick: number): boolean {
  "worklet";
  return sinceTick >= (hold.detached ? TICK_GAP_MS : LIST_TICK_GAP_MS);
}

/**
 * How near a cell's centre counts as *on* it, in cells — about four points.
 *
 * An animated landing ends a rounding error short of where it was sent, so
 * exact equality would let the one arrival that matters most go by in silence.
 */
export const ARRIVE_SLACK = 0.08;

/**
 * The cell whose centre the ring has just reached, or `-1`.
 *
 * **Arrival, not the halfway line** (S04 §7). The tick was fired when the
 * *nearest* cell changed, which is the midpoint between two days: in the hand
 * it marked leaving a day rather than reaching one, and a strip that then
 * snapped the last half cell did so in silence. A tick is the ring *taking* a
 * day, so it fires when a centre is under the ring — reached, or passed through
 * between two frames, since a fling never rests on the ones it crosses.
 *
 * The caller holds the cell last ticked and compares; resting on a centre
 * answers with it every frame.
 */
export function arrivedAt(before: number, now: number): number {
  "worklet";
  if (Number.isNaN(before) || Number.isNaN(now)) return -1;
  const near = Math.round(now);
  const off = now - near;
  if (off <= ARRIVE_SLACK && off >= -ARRIVE_SLACK) return near;
  if (now > before) {
    const passed = Math.floor(now);
    return passed > before ? passed : -1;
  }
  if (now < before) {
    const passed = Math.ceil(now);
    return passed < before ? passed : -1;
  }
  return -1;
}

/**
 * How long a landing is given to finish before it is checked. Under
 * `QUIET_MS`, so a strip being put back is never read as a hand moving it.
 */
export const LAND_MS = 450;

/**
 * A landing further than this is the strip being *re-seated* — a cold open, a
 * re-indexed run of days — and the cells it sweeps over on the way are not
 * days going past the reader. It lands in silence.
 */
export const RESEAT_CELLS = 1.5;

/**
 * Whether a strip at rest has to be sent home again.
 *
 * **A landing was written once and believed.** On a device an animated
 * `scrollTo` is not a promise: the strip's run of days is re-cut around the
 * day the list settled on, the content changes size under the animation, and
 * the scroller drops it — leaving the ring a day or two from the list's day
 * with nothing left that would ever look again. Seen on a phone as *scroll
 * back to the top and the ring is on Wednesday*; never in a browser, where the
 * write is synchronous. `gap` is where it should be less where it **is**.
 */
export function relandsNow(gap: number, sinceWrite: number): boolean {
  "worklet";
  if (Number.isNaN(gap) || sinceWrite < LAND_MS) return false;
  return gap >= 0.5 || gap <= -0.5;
}
