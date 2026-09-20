import { describe, expect, it } from "vitest";
import { advance, justSettled, SETTLE_MS, type Settling, UNREAD } from "./scroll-settle.ts";

const START: Settling = UNREAD;

describe("advance", () => {
  it("resets the clock whenever the offset moves", () => {
    const moving = advance({ at: 100, still: 90, moved: true }, 140, 16);
    expect(moving).toEqual({ at: 140, still: 0, moved: true });
  });

  it("ages a scroller that has not moved", () => {
    expect(advance({ at: 100, still: 90, moved: true }, 100, 16)).toEqual({
      at: 100,
      still: 106,
      moved: true,
    });
  });

  it("ignores a frame that did not happen", () => {
    expect(advance({ at: 100, still: 90, moved: true }, 100, -5)).toEqual({
      at: 100,
      still: 90,
      moved: true,
    });
  });
});

describe("justSettled", () => {
  it("is true exactly once per stop", () => {
    // A predicate that said "it is still" would be true on every frame after
    // the scroll stopped, and the caller would write the date sixty times a
    // second while nothing moved.
    let state = START;
    let fired = 0;
    // One real movement first — a scroller resting where it began has not
    // stopped, it has not started.
    state = advance(state, 0, 16);
    for (let frame = 0; frame < 60; frame += 1) {
      const next = advance(state, 500, 16);
      if (justSettled(state, next)) fired += 1;
      state = next;
    }
    expect(fired).toBe(1);
  });

  it("does not fire while the scroller is still moving", () => {
    let state = START;
    let fired = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const next = advance(state, frame * 12, 16);
      if (justSettled(state, next)) fired += 1;
      state = next;
    }
    expect(fired).toBe(0);
  });

  it("fires again after the scroller moves and stops a second time", () => {
    let state = START;
    let fired = 0;
    const offsets = [
      0,
      ...Array.from({ length: 20 }, () => 300),
      ...Array.from({ length: 5 }, (_, i) => 300 + i * 40),
      ...Array.from({ length: 20 }, () => 500),
    ];
    for (const at of offsets) {
      const next = advance(state, at, 16);
      if (justSettled(state, next)) fired += 1;
      state = next;
    }
    expect(fired).toBe(2);
  });

  it("waits long enough to outlast a decaying fling", () => {
    // A fling whose frames are 16ms apart must not be called settled between
    // two of them.
    expect(SETTLE_MS).toBeGreaterThan(16 * 4);
  });
});

describe("the first read", () => {
  it("is a position, never a stop", () => {
    // `0` is a real offset — the top of every list — so a state that started
    // there reported a settle ~140ms after mount with no gesture at all, and
    // whatever consumes the report acted on it.
    let state: Settling = UNREAD;
    let fired = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const next = advance(state, 0, 16);
      if (justSettled(state, next)) fired += 1;
      state = next;
    }
    expect(fired, "a list nobody touched never settles").toBe(0);
  });

  it("settles once the reader has actually moved it and stopped", () => {
    let state: Settling = UNREAD;
    let fired = 0;
    // Read at 0, then a real gesture, then still.
    for (const at of [0, 40, 120, 260, ...Array.from({ length: 20 }, () => 260)]) {
      const next = advance(state, at, 16);
      if (justSettled(state, next)) fired += 1;
      state = next;
    }
    expect(fired).toBe(1);
  });
});
