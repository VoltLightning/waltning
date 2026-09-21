import { describe, expect, it } from "vitest";
import { advance, justSettled, LIFTED, type Settling } from "../../../primitives/scroll-settle.ts";
import {
  ARRIVE_SLACK,
  arrivedAt,
  type Frame,
  type Grip,
  grip,
  LAND_MS,
  LIST_TICK_GAP_MS,
  LOOSE,
  letGo,
  QUIET_MS,
  relandsNow,
  snapsNow,
  TICK_GAP_MS,
  takeHold,
  ticksNow,
} from "./grip.ts";

/** A frame in which nothing happened, long after the last write. */
const QUIET: Frame = { listJumped: false, drifted: false, sinceWrite: QUIET_MS + 1 };

/** The strip moved, and this component has been silent: a hand. */
const BY_HAND: Frame = { ...QUIET, drifted: true };

describe("who is driving", () => {
  it("gives the strip to a hand that moves it", () => {
    expect(grip(LOOSE, BY_HAND).detached).toBe(true);
  });

  /**
   * **The one that broke the strip on a phone and nowhere else.** A native
   * `scrollTo` is asynchronous: the scroller reports where it is through
   * scroll events that trail the write which caused them. Asking *is the strip
   * where I put it?* is therefore always *no* while the list scrolls, so the
   * strip detached itself mid-scroll, every scroll, and stopped following the
   * list. On the web the write is synchronous — and every suite that could
   * have seen this runs in a browser.
   */
  it("does not mistake its own writes arriving late for a hand", () => {
    let hold = LOOSE;
    // Sixty frames of list scrolling: a write every frame, and the strip's
    // reported offset changing every frame as the events catch up.
    for (let frame = 0; frame < 60; frame += 1) {
      hold = grip(hold, { listJumped: frame === 0, drifted: true, sinceWrite: 16 });
      expect(hold.detached, `frame ${frame}`).toBe(false);
    }
  });

  it("does not mistake its own landing animation for one either", () => {
    // An animated write keeps moving the strip for ~300ms after it was issued.
    let hold = LOOSE;
    for (let ms = 16; ms < 400; ms += 16) {
      hold = grip(hold, { listJumped: false, drifted: true, sinceWrite: ms });
    }
    expect(hold.detached).toBe(false);
  });

  it("takes it back when the reader returns to the list", () => {
    const held: Grip = { dragging: false, detached: true };
    expect(grip(held, { ...QUIET, listJumped: true }).detached).toBe(false);
  });

  it("keeps it through the list's own glide", () => {
    let hold = takeHold();
    for (let frame = 0; frame < 30; frame += 1) {
      // `listJumped` is false for a glide — it is only the *start* of a move.
      hold = grip(hold, { ...BY_HAND, listJumped: false });
    }
    expect(hold.detached).toBe(true);
  });

  /**
   * **The one the user reported first.** Dragging the strip is a horizontal
   * gesture on a scroller inside a page that scrolls vertically, so a real
   * thumb moves the list a point or two as well — and that counted as the
   * reader taking the list back, mid-gesture. From the 20th toward the 16th,
   * the strip snapped home to the 20th under the thumb.
   */
  it("holds through the list movement a thumb drag causes", () => {
    let hold = takeHold();
    for (let frame = 0; frame < 20; frame += 1) {
      hold = grip(hold, { ...BY_HAND, listJumped: frame % 3 === 0 });
      expect(hold.detached, `frame ${frame}`).toBe(true);
    }
    // And the moment the finger leaves, the list can have it back.
    hold = letGo(hold);
    expect(grip(hold, { ...QUIET, listJumped: true }).detached).toBe(false);
  });
});

describe("when the strip may settle onto a cell", () => {
  it("never while a finger is down", () => {
    expect(snapsNow({ dragging: true, detached: true }, true, false)).toBe(false);
  });

  it("once the finger has gone and the strip has stopped", () => {
    expect(snapsNow({ dragging: false, detached: true }, true, false)).toBe(true);
  });

  it("not twice for one stop", () => {
    expect(snapsNow({ dragging: false, detached: true }, true, true)).toBe(false);
  });

  /**
   * **The snap that only worked with a flick.** The clock the snap waits on
   * restarts when the finger lifts, and it restarted as *never moved* — so a
   * finger lifted without momentum had nothing to have stopped, never settled,
   * and left the strip between two days. Only a flick snapped, because the
   * momentum supplied the movement the rule wanted.
   */
  it("after a lift with no flick at all", () => {
    let rest: Settling = LIFTED;
    let settled = false;
    for (let frame = 0; frame < 20 && !settled; frame += 1) {
      const next = advance(rest, 1234, 16);
      settled = justSettled(rest, next);
      rest = next;
    }
    expect(settled, "stillness alone is a stop, once a finger has been and gone").toBe(true);
  });
});

describe("when a day passing the ring taps", () => {
  it("whenever a hand is what sent it past — coasting included", () => {
    // Each cell is a snap point. Narrowed to finger-down-only, the feedback cut
    // out the moment the finger lifted, which on a device reads as broken.
    expect(ticksNow({ dragging: true, detached: true }, TICK_GAP_MS)).toBe(true);
    expect(ticksNow({ dragging: false, detached: true }, TICK_GAP_MS)).toBe(true);
  });

  it("when the list is what sent it past, too", () => {
    // **Decided the other way once, and overruled by a device.** Scrolling the
    // ledger is how this strip is moved nearly all of the time, so a strip
    // that only tapped under a thumb was, in the hand, a strip with no
    // haptics at all.
    expect(ticksNow(LOOSE, LIST_TICK_GAP_MS)).toBe(true);
  });

  it("thins a fling of the list to a purr", () => {
    // What is left of the argument against it: forty days through one fling
    // is a notification, so the list's floor is the longer of the two.
    expect(LIST_TICK_GAP_MS).toBeGreaterThan(TICK_GAP_MS);
    expect(ticksNow(LOOSE, LIST_TICK_GAP_MS - 1)).toBe(false);
  });

  it("no faster than the engine can say them apart", () => {
    expect(ticksNow({ dragging: false, detached: true }, TICK_GAP_MS - 1)).toBe(false);
  });
});

describe("which day the ring has reached", () => {
  /**
   * **The one a hand reported.** The tick fired when the *nearest* cell
   * changed — the halfway line between two days — so it marked leaving a day,
   * and the half cell the strip then snapped went by in silence.
   */
  it("none at the halfway line, where the tick used to be", () => {
    expect(arrivedAt(44.4, 44.6)).toBe(-1);
    expect(arrivedAt(44.6, 44.4)).toBe(-1);
  });

  it("the day whose centre comes under the ring, from either side", () => {
    expect(arrivedAt(44.8, 45 - ARRIVE_SLACK / 2)).toBe(45);
    expect(arrivedAt(45.2, 45 + ARRIVE_SLACK / 2)).toBe(45);
  });

  it("a landing that ends a rounding error short", () => {
    expect(arrivedAt(44.99, 44.9999)).toBe(45);
  });

  it("a centre passed through between two frames, which a fling never rests on", () => {
    expect(arrivedAt(44.7, 45.3)).toBe(45);
    expect(arrivedAt(45.3, 44.7)).toBe(45);
    // Several in one frame: the last one reached.
    expect(arrivedAt(42.5, 45.4)).toBe(45);
    expect(arrivedAt(45.4, 42.5)).toBe(43);
  });

  it("nothing for a strip that has not been read yet", () => {
    expect(arrivedAt(Number.NaN, 12.5)).toBe(-1);
  });
});

describe("a landing that never arrived", () => {
  it("is sent again once it has had its time", () => {
    // Two cells out, long after the write: the scroller dropped it.
    expect(relandsNow(104, LAND_MS)).toBe(true);
    expect(relandsNow(-104, LAND_MS)).toBe(true);
  });

  it("is left alone while it is still on its way", () => {
    expect(relandsNow(104, LAND_MS - 1)).toBe(false);
  });

  it("is not re-sent for the fraction of a point a scroller rounds by", () => {
    expect(relandsNow(0.3, LAND_MS * 4)).toBe(false);
  });

  it("checks before a strip being put back could be read as a hand", () => {
    expect(LAND_MS).toBeLessThan(QUIET_MS);
  });
});
