import { describe, expect, it } from "vitest";
import {
  aheadCount,
  CELL,
  EXACT_SPEED,
  follow,
  fracAt,
  fracFor,
  MAX_STEP,
  nearestCell,
  offsetFor,
  offsetWithin,
  STRIDE,
  trackLead,
} from "./scrub.ts";

const FRAME = 1 / 60;

describe("offsetFor", () => {
  it("puts the day at the middle of the band", () => {
    const band = 390;
    // The cell's centre, once the strip has been shifted by what this returns.
    const centre = trackLead(band) + 6 * STRIDE + CELL / 2 - offsetFor(6, band);
    expect(centre).toBe(band / 2);
  });

  it("moves a fraction of a cell for a fraction of a day", () => {
    const band = 390;
    // The whole design in one assertion: four tenths of a day is four tenths
    // of a cell, not nothing and then a whole one.
    expect(offsetFor(6.4, band) - offsetFor(6, band)).toBeCloseTo(0.4 * STRIDE, 10);
  });

  it("clamps at the near end and refuses an unmeasured band", () => {
    expect(offsetFor(0, 390)).toBe(0);
    expect(offsetFor(-3, 390)).toBe(0);
    expect(offsetFor(6, 0)).toBe(0);
  });
});

describe("aheadCount", () => {
  it("draws enough days to reach the band's right edge", () => {
    for (const band of [320, 390, 430, 768, 1024]) {
      const count = aheadCount(band);
      // The last ahead cell's right edge, measured from the centred day.
      const reach = count * STRIDE + CELL / 2;
      expect(reach).toBeGreaterThanOrEqual(band / 2);
      // And not a cell more than it needs.
      expect((count - 1) * STRIDE + CELL / 2).toBeLessThan(band / 2);
    }
  });

  it("is zero before the band is measured", () => {
    expect(aheadCount(0)).toBe(0);
    expect(aheadCount(-1)).toBe(0);
  });
});

describe("fracFor", () => {
  const tops = [8, 150, 228, 434, 500];
  // One strip cell per list row here: the simple case, where nothing collapsed.
  const marks = [0, 1, 2, 3, 4];

  it("is exact on a day's own top", () => {
    tops.forEach((top, i) => {
      expect(fracFor(top, tops, marks)).toBeCloseTo(i, 10);
    });
  });

  it("is linear between two tops", () => {
    // Half way down the day that runs 150 → 228.
    expect(fracFor(189, tops, marks)).toBeCloseTo(1.5, 10);
    expect(fracFor(150 + 0.25 * 78, tops, marks)).toBeCloseTo(1.25, 10);
  });

  it("sweeps a collapsed run rather than snapping at its far end", () => {
    // `QuietRun` draws a week of nothing as ONE row, and the strip draws seven
    // cells for it. Scrolling through that row has to move the strip across
    // all seven — the arithmetic that assumed one row was one cell is why this
    // takes a second array at all.
    const runTops = [0, 100, 140, 240];
    const runMarks = [0, 1, 8, 9];
    expect(fracFor(100, runTops, runMarks)).toBeCloseTo(1, 10);
    expect(fracFor(120, runTops, runMarks)).toBeCloseTo(4.5, 10);
    expect(fracFor(140, runTops, runMarks)).toBeCloseTo(8, 10);
  });

  it("reads the strip's order out of the marks, not out of the index", () => {
    // The list is newest-first and the strip is earliest-first, so the marks
    // descend as the list does. Nothing else in this file knows that.
    const descending = [25, 24, 23, 22, 21];
    expect(fracFor(8, tops, descending)).toBe(25);
    expect(fracFor(189, tops, descending)).toBeCloseTo(23.5, 10);
    expect(fracFor(9999, tops, descending)).toBe(21);
  });

  it("clamps both ends, because iOS rubber-bands past the top", () => {
    expect(fracFor(-200, tops, marks)).toBe(0);
    expect(fracFor(0, tops, marks)).toBe(0);
    expect(fracFor(9999, tops, marks)).toBe(marks.length - 1);
  });

  it("answers for a list with nothing in it", () => {
    expect(fracFor(0, [], [])).toBe(0);
    expect(fracFor(120, [8], [3])).toBe(3);
  });

  it("does not divide by a zero span", () => {
    expect(Number.isFinite(fracFor(60, [0, 60, 60, 120], [0, 1, 2, 3]))).toBe(true);
  });

  it("ignores a marks array the list has outgrown", () => {
    // The two are written a frame apart on the UI thread; a shorter one must
    // shorten the answer rather than read past its end.
    expect(Number.isFinite(fracFor(400, tops, [0, 1]))).toBe(true);
  });

  it("never goes backwards as the list scrolls forwards", () => {
    let last = -1;
    for (let offset = -50; offset < 600; offset += 3) {
      const at = fracFor(offset, tops, marks);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
  });
});

describe("fracAt", () => {
  it("reads offsetFor backwards, so a dragged strip reports a day", () => {
    const band = 390;
    // Above the near-end clamp, where the track really can put the asked-for
    // day in the middle.
    for (const frac of [3.5, 12, 24.25]) {
      expect(fracAt(offsetFor(frac, band), band)).toBeCloseTo(frac, 10);
    }
  });

  it("can put the very first cell under the ring", () => {
    // **The near end used to be unreachable.** The track was padded by the
    // screen's gutter, so the first cells had no room left of them:
    // `offsetFor(0)` clamped to zero and the ring sat on the *third* cell
    // while the list showed the first — nine cells out on a 1024-wide band.
    // `aheadCount` had always done this for the far end; nothing did it here.
    for (const band of [320, 390, 430, 768, 1024]) {
      expect(offsetFor(0, band)).toBe(0);
      expect(fracAt(0, band), `band ${band}`).toBeCloseTo(0, 10);
    }
  });

  it("round-trips every real cell, at every band", () => {
    // What the padding buys: the command and the position agree everywhere,
    // which is what lets the strip tell its own clamped write from a hand.
    for (const band of [320, 390, 430, 768, 1024]) {
      for (const frac of [0, 1, 2.98, 7.5, 40]) {
        expect(fracAt(offsetFor(frac, band), band), `${band} @ ${frac}`).toBeCloseTo(frac, 10);
      }
    }
  });

  it("is zero before the band is measured", () => {
    expect(fracAt(400, 0)).toBe(0);
  });
});

describe("follow", () => {
  /** A sustained drag at `cellsPerSecond`, sampled at `fps`. Returns the worst lag, in points. */
  function drag(cellsPerSecond: number, fps: number): number {
    const dt = 1 / fps;
    let shown = 0;
    let target = 0;
    let worst = 0;
    for (let frame = 0; frame < fps * 2; frame += 1) {
      target += cellsPerSecond * dt;
      shown = follow(shown, target, cellsPerSecond, dt);
      const behind = (target - shown) * STRIDE;
      if (behind > worst) worst = behind;
    }
    return worst;
  }

  it("tracks a reading drag with nothing behind it, at every frame rate", () => {
    // **The frame rates are the point.** Tapered on the *gap*, the exact band
    // was a function of the sampling interval: at 30fps — an ordinary
    // mid-range Android, or a loaded browser tab — fifteen cells a second
    // lagged by a cell and a half for the whole gesture, while the one test
    // that existed sampled at 60 and passed.
    for (const fps of [24, 30, 45, 60, 90, 120]) {
      for (const speed of [1, 5, 10, 15]) {
        expect(drag(speed, fps), `${speed} cells/s at ${fps}fps`).toBeLessThan(0.01);
      }
    }
  });

  it("has no cliff just past the exact band", () => {
    // The gap-tapered version multiplied the lag by 64 for a 10% change in
    // speed. Doubling the speed may not much more than double the lag.
    for (const fps of [30, 60, 120]) {
      const slow = drag(EXACT_SPEED * 1.2, fps);
      const fast = drag(EXACT_SPEED * 1.32, fps);
      expect(fast, `${fps}fps`).toBeLessThan(Math.max(slow * 4, 4));
    }
  });

  it("lands a fling in the same place whatever the frame rate", () => {
    // Same wall clock, same travel: 40 cells over 300ms, then a second to
    // settle. A follower whose resting place depends on the device's refresh
    // rate is not damped, it is unpredictable.
    const landing = (fps: number) => {
      const dt = 1 / fps;
      const speed = 40 / 0.3;
      let shown = 0;
      // The target is a function of the wall clock, not of the frames — so
      // every rate follows the *same* motion rather than a slightly different
      // one, which is what makes the comparison about `follow` at all.
      for (let frame = 1; frame * dt <= 1.3; frame += 1) {
        const t = frame * dt;
        const target = speed * Math.min(t, 0.3);
        shown = follow(shown, target, t <= 0.3 ? speed : 0, dt);
      }
      return shown;
    };
    const at60 = landing(60);
    for (const fps of [24, 30, 90, 240]) {
      expect(Math.abs(landing(fps) - at60) * STRIDE, `${fps}fps`).toBeLessThan(0.5);
    }
  });

  it("lags a fling, and never overshoots it", () => {
    const speed = 40 / 0.3;
    let shown = 0;
    let target = 0;
    for (let frame = 0; frame < 18; frame += 1) {
      target += speed * FRAME;
      const next = follow(shown, target, speed, FRAME);
      expect(next).toBeGreaterThan(shown);
      expect(next).toBeLessThan(target);
      shown = next;
    }
    expect(shown).toBeGreaterThan(10);
    expect(shown).toBeLessThan(40);
  });

  it("catches up once the fling is over", () => {
    let shown = 10;
    for (let frame = 0; frame < 60; frame += 1) shown = follow(shown, 40, 0, FRAME);
    expect(shown).toBe(40);
  });

  it("always moves toward the target, whichever way it is", () => {
    for (const gap of [-40, -3, -0.2, 0.2, 3, 40]) {
      const next = follow(0, gap, 200, FRAME);
      expect(Math.sign(next)).toBe(Math.sign(gap));
      expect(Math.abs(next)).toBeLessThanOrEqual(Math.abs(gap));
    }
  });

  it("holds still for a frame that did not happen", () => {
    expect(follow(3, 40, 200, 0)).toBe(3);
    expect(follow(3, 40, 200, -1)).toBe(3);
  });

  it("integrates a backgrounded screen as one clamped step", () => {
    expect(follow(0, 40, 200, 90)).toBe(follow(0, 40, 200, MAX_STEP));
  });

  it("treats a speed it cannot read as reading speed", () => {
    // `NaN` arrives from a zero-length frame. Exact tracking is the safe
    // answer: the strip is where the day is, which is never *wrong*.
    expect(follow(0, 12, Number.NaN, FRAME)).toBe(12);
  });
});

describe("offsetWithin", () => {
  const band = 390;

  it("is offsetFor where the scroller can reach it", () => {
    expect(offsetWithin(12, band, 4000)).toBe(offsetFor(12, band));
  });

  it("stops at the end of the content rather than past it", () => {
    // A `scrollTo` past the end is silently clamped by the scroller, which
    // leaves the strip somewhere nobody asked for — and the component then
    // reads its own clamped write as a reader dragging the strip.
    expect(offsetWithin(200, band, 2368)).toBe(2368 - band);
  });

  it("asks for nothing before the content has been reported", () => {
    expect(offsetWithin(12, band, 0)).toBe(offsetFor(12, band));
  });

  it("is zero when the content does not fill the band", () => {
    expect(offsetWithin(12, band, 200)).toBe(0);
  });
});

describe("nearestCell", () => {
  const band = 390;

  it("rounds to the cell the ring is nearest", () => {
    expect(nearestCell(offsetFor(12, band), band, 40)).toBe(12);
    expect(nearestCell(offsetFor(12.4, band), band, 40)).toBe(12);
    expect(nearestCell(offsetFor(12.6, band), band, 40)).toBe(13);
  });

  it("names only a cell the run actually holds", () => {
    // `fracAt` is unbounded, so its answer still has to be clamped to the run
    // — but both ends are now genuinely reachable (`trackLead` pads them), so
    // the near end snaps to the first cell rather than to the third.
    expect(nearestCell(0, band, 40)).toBe(0);
    expect(nearestCell(99999, band, 40)).toBe(39);
    expect(nearestCell(offsetFor(50, band), band, 40)).toBe(39);
  });

  it("answers for a strip with nothing in it", () => {
    expect(nearestCell(0, band, 0)).toBe(0);
  });
});
