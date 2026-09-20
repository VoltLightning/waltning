import { describe, expect, it } from "vitest";
import { type Frame, type Grip, grip, LOOSE, letGo, snapsNow, takeHold, ticksNow } from "./grip.ts";

/** A frame in which nothing happened. */
const QUIET: Frame = { listJumped: false, drifted: false, reachable: true, moved: false };

/** The strip moved, by a hand: drifted, from a reachable write, by more than a hair. */
const BY_HAND: Frame = { ...QUIET, drifted: true, moved: true };

describe("who is driving", () => {
  it("gives the strip to a hand that moves it", () => {
    expect(grip(LOOSE, BY_HAND).detached).toBe(true);
  });

  it("does not give it to a write the scroller clamped", () => {
    // The strip's content grows as the list pages, so a write can land short
    // of where it asked. Read as a hand, the strip detached on a cold open
    // with nobody touching it — and only a list movement could clear it.
    expect(grip(LOOSE, { ...BY_HAND, reachable: false }).detached).toBe(false);
  });

  it("does not give it away for a rounding error", () => {
    expect(grip(LOOSE, { ...BY_HAND, moved: false }).detached).toBe(false);
  });

  it("takes it back when the reader returns to the list", () => {
    const held: Grip = { dragging: false, detached: true };
    expect(grip(held, { ...QUIET, listJumped: true }).detached).toBe(false);
  });

  it("keeps it through the list's own glide", () => {
    // A fling leaves the list gliding for a while; every frame of the glide
    // used to overrule a hand that had since arrived.
    let hold = takeHold();
    for (let frame = 0; frame < 30; frame += 1) {
      // `listJumped` is false for a glide — it is only the *start* of a move.
      hold = grip(hold, { ...BY_HAND, listJumped: false });
    }
    expect(hold.detached).toBe(true);
  });

  /**
   * **The one the user reported.** Dragging the strip is a horizontal gesture
   * on a scroller inside a page that scrolls vertically, so a real thumb moves
   * the list a point or two as well — and that counted as the reader taking
   * the list back, mid-gesture. From the 20th toward the 16th, the strip
   * snapped home to the 20th under the thumb.
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
    // A pause mid-drag is not a stop: the strip animated to the nearest cell
    // while the thumb was still moving, which reads as it jumping off on its
    // own — the 10th, on the way from the 20th to the 16th.
    expect(snapsNow({ dragging: true, detached: true }, true, false)).toBe(false);
  });

  it("once the finger has gone and the strip has stopped", () => {
    expect(snapsNow({ dragging: false, detached: true }, true, false)).toBe(true);
  });

  it("not twice for one stop", () => {
    expect(snapsNow({ dragging: false, detached: true }, true, true)).toBe(false);
  });
});

describe("when a day crossing taps", () => {
  it("only under a finger", () => {
    // Thirty cells of coasting after a flick is a notification where a texture
    // was wanted.
    expect(ticksNow({ dragging: false, detached: true }, false)).toBe(false);
    expect(ticksNow({ dragging: true, detached: true }, false)).toBe(true);
  });

  it("not for a crossing with nothing to compare against", () => {
    expect(ticksNow({ dragging: true, detached: true }, true)).toBe(false);
  });
});
