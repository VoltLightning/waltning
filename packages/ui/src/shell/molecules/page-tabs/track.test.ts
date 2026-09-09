import { describe, expect, it } from "vitest";
import { markerShift, slotWidth, tabNearness, tintRange } from "./track.ts";

describe("slotWidth", () => {
  it("divides the row evenly, whatever the device", () => {
    // The tabs are `flex: 1`, so this is exact rather than measured — and a
    // measurement is what does not fire in this tree.
    expect(slotWidth(4)).toBe("25%");
    expect(slotWidth(2)).toBe("50%");
  });

  it("survives a row with no tabs rather than dividing by zero", () => {
    expect(slotWidth(0)).toBe("100%");
  });
});

describe("markerShift", () => {
  it("moves one slot per page, in the marker's own widths", () => {
    expect(markerShift(0)).toBe("0%");
    expect(markerShift(1)).toBe("100%");
    expect(markerShift(3)).toBe("300%");
  });

  it("leaves the marker between two names mid-swipe", () => {
    // The whole point: a half-finished swipe is drawn half-finished, where a
    // marker driven by the active page could only jump when the gesture ends.
    expect(markerShift(1.5)).toBe("150%");
    expect(markerShift(2.25)).toBe("225%");
  });

  it("stops at the first page when the swipe rubber-bands past it", () => {
    // A bar slid off the row is a bar drawn where no tab is.
    expect(markerShift(-0.4)).toBe("0%");
  });

  it("survives a scroller reporting nothing useful", () => {
    expect(markerShift(Number.NaN)).toBe("0%");
  });
});

describe("tabNearness", () => {
  it("is full on the page and gone a page away", () => {
    expect(tabNearness(1, 1)).toBe(1);
    expect(tabNearness(0, 1)).toBe(0);
    expect(tabNearness(2, 1)).toBe(0);
    expect(tabNearness(3, 1)).toBe(0);
  });

  it("leaves both names half-inked halfway between them", () => {
    expect(tabNearness(0.5, 0)).toBeCloseTo(0.5);
    expect(tabNearness(0.5, 1)).toBeCloseTo(0.5);
  });

  it("never leaves the row with no inked name", () => {
    for (let p = 0; p <= 3.0001; p += 0.1) {
      const lit = Math.max(...[0, 1, 2, 3].map((index) => tabNearness(p, index)));
      expect(lit, `nothing inked at ${p.toFixed(1)}`).toBeGreaterThan(0);
    }
  });

  it("falls back to the first tab rather than inking nothing", () => {
    expect(tabNearness(Number.NaN, 0)).toBe(1);
    expect(tabNearness(Number.NaN, 2)).toBe(0);
  });
});

describe("tintRange", () => {
  it("puts the tab's own page in the middle of its ramp", () => {
    expect(tintRange(2)).toEqual([1, 2, 3]);
  });
});
