import { describe, expect, it } from "vitest";
import {
  aheadCount,
  CELL,
  FOLLOW_EXACT,
  follow,
  fracAt,
  fracFor,
  MAX_STEP,
  nearestCell,
  offsetFor,
  offsetWithin,
  STRIDE,
  TRACK_LEAD,
} from "./scrub.ts";

const FRAME = 1 / 60;

describe("offsetFor", () => {
  it("puts the day at the middle of the band", () => {
    const band = 390;
    // The cell's centre, once the strip has been shifted by what this returns.
    const centre = TRACK_LEAD + 6 * STRIDE + CELL / 2 - offsetFor(6, band);
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

  it("reports the day under the ring, not the day that was asked for", () => {
    // The first cells cannot be centred: the track has no room left of them,
    // so `offsetFor` clamps and the strip sits at zero showing its third cell.
    // A round trip that returned 0 here would spring a re-attaching strip to a
    // day it was never on.
    const band = 390;
    expect(offsetFor(0, band)).toBe(0);
    expect(fracAt(0, band)).toBeCloseTo((band / 2 - CELL / 2 - TRACK_LEAD) / STRIDE, 10);
    expect(fracAt(0, band)).toBeGreaterThan(0);
  });

  it("is zero before the band is measured", () => {
    expect(fracAt(400, 0)).toBe(0);
  });
});

describe("follow", () => {
  it("tracks a reading drag with nothing behind, sustained", () => {
    // **The real condition, not one frame from a standing start.** A drag is
    // continuous and the strip begins it caught up, so what matters is whether
    // it stays caught up while the finger moves — which is the state a single
    // step from zero does not describe.
    //
    // Up to fifteen days a second: fast for reading dates, and §7 promises
    // this band is exact. Stated in points, the unit the reader sees, because
    // a strip a hundredth of a pixel behind is on the pixel it belongs on.
    // A linear taper left 35% of the gap unclosed here, which is a strip
    // visibly trailing the finger at the one speed that must not lag.
    for (const cellsPerSecond of [1, 5, 10, 15]) {
      const per = cellsPerSecond * FRAME;
      let shown = 0;
      let target = 0;
      let worst = 0;
      for (let frame = 0; frame < 90; frame += 1) {
        target += per;
        shown = follow(shown, target, FRAME);
        const behind = (target - shown) * STRIDE;
        if (behind > worst) worst = behind;
      }
      expect(worst).toBeLessThan(1);
    }
  });

  it("lags a fling, and never overshoots it", () => {
    // Forty days in 300ms — the case §7 names.
    let shown = 0;
    for (let frame = 0; frame < 18; frame += 1) {
      const target = (frame + 1) * (40 / 18);
      const next = follow(shown, target, FRAME);
      expect(next).toBeGreaterThan(shown);
      expect(next).toBeLessThan(target);
      shown = next;
    }
    // Behind, but moving — not parked, and not ahead.
    expect(shown).toBeGreaterThan(20);
    expect(shown).toBeLessThan(40);
  });

  it("catches up once the fling is over", () => {
    let shown = 10;
    for (let frame = 0; frame < 60; frame += 1) shown = follow(shown, 40, FRAME);
    expect(shown).toBeCloseTo(40, 6);
  });

  it("is continuous where the damping eases off", () => {
    // The spelling this replaces snapped here: exact below a threshold and
    // damped above it jumps the remaining gap as a fling decays. Two gaps
    // either side of `FOLLOW_EXACT` must move by nearly the same amount.
    const below = FOLLOW_EXACT - 0.01;
    const above = FOLLOW_EXACT + 0.01;
    const movedBelow = follow(0, below, FRAME) - 0;
    const movedAbove = follow(0, above, FRAME) - 0;
    expect(Math.abs(movedAbove - movedBelow)).toBeLessThan(0.05);
  });

  it("always moves toward the target, whichever way it is", () => {
    for (const gap of [-40, -3, -0.2, 0.2, 3, 40]) {
      const next = follow(0, gap, FRAME);
      expect(Math.sign(next)).toBe(Math.sign(gap));
      expect(Math.abs(next)).toBeLessThanOrEqual(Math.abs(gap));
    }
  });

  it("holds still for a frame that did not happen", () => {
    expect(follow(3, 40, 0)).toBe(3);
    expect(follow(3, 40, -1)).toBe(3);
  });

  it("integrates a backgrounded screen as one clamped step", () => {
    // Away for 90 seconds. Without the clamp this is `1 - exp(-750)`, which is
    // the right answer for the wrong reason.
    expect(follow(0, 40, 90)).toBe(follow(0, 40, MAX_STEP));
  });

  it("settles exactly rather than approaching forever", () => {
    let shown = 0;
    for (let frame = 0; frame < 120; frame += 1) shown = follow(shown, 12, FRAME);
    expect(shown).toBe(12);
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
    // `fracAt` is unbounded and the end cells cannot be centred at all — the
    // track has no room either side of them — so rounding its answer alone
    // snaps the strip to an offset it can never reach.
    expect(nearestCell(0, band, 40)).toBe(3);
    expect(nearestCell(99999, band, 40)).toBe(39);
    expect(nearestCell(offsetFor(50, band), band, 40)).toBe(39);
  });

  it("answers for a strip with nothing in it", () => {
    expect(nearestCell(0, band, 0)).toBe(0);
  });
});
