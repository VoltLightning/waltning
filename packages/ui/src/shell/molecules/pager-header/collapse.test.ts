import { describe, expect, it } from "vitest";
import {
  COLLAPSE_TRAVEL,
  COLLAPSED_HEIGHT,
  collapseProgress,
  EXPANDED_HEIGHT,
  HANDOVER,
  headerHeight,
  isCollapsed,
  restLift,
  restOpacity,
  shutOpacity,
  shutSettle,
} from "./collapse.ts";

describe("collapseProgress", () => {
  it("is 0 at rest", () => {
    expect(collapseProgress(0)).toBe(0);
  });

  it("clamps the rubber band", () => {
    // iOS bounces past the top on every flick. Without this the header would
    // be asked to draw itself taller than expanded, which neither layer is
    // laid out for.
    expect(collapseProgress(-120)).toBe(0);
  });

  it("is 1 once the header has given up its whole height, and stays there", () => {
    expect(collapseProgress(COLLAPSE_TRAVEL)).toBe(1);
    expect(collapseProgress(COLLAPSE_TRAVEL * 40)).toBe(1);
  });

  it("moves with the content between the two", () => {
    expect(collapseProgress(COLLAPSE_TRAVEL / 2)).toBeCloseTo(0.5);
    expect(collapseProgress(COLLAPSE_TRAVEL / 4)).toBeCloseTo(0.25);
  });

  it("survives a scroller reporting nothing useful", () => {
    expect(collapseProgress(Number.NaN)).toBe(0);
  });

  it("spends exactly the height it gives up", () => {
    // The header rises at the speed of the content under it. A round number
    // here instead would let the two drift apart the day a height changes.
    expect(COLLAPSE_TRAVEL).toBe(EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
  });
});

describe("headerHeight", () => {
  it("runs between the two drawn heights and no further", () => {
    expect(headerHeight(0)).toBe(EXPANDED_HEIGHT);
    expect(headerHeight(1)).toBe(COLLAPSED_HEIGHT);
    expect(headerHeight(0.5)).toBe((EXPANDED_HEIGHT + COLLAPSED_HEIGHT) / 2);
  });
});

describe("the two layers", () => {
  it("never both show at once", () => {
    // Two layouts at half opacity are two ghosts. One has to finish leaving
    // before the other starts arriving.
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const both = restOpacity(p) > 0 && shutOpacity(p) > 0;
      expect(both, `both visible at ${p.toFixed(2)}`).toBe(false);
    }
  });

  it("always shows one", () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const lit = Math.max(restOpacity(p), shutOpacity(p));
      expect(lit, `nothing visible at ${p.toFixed(2)}`).toBeGreaterThan(0);
    }
  });

  it("reaches full opacity at each end", () => {
    expect(restOpacity(0)).toBe(1);
    expect(shutOpacity(1)).toBe(1);
    expect(restOpacity(1)).toBe(0);
    expect(shutOpacity(0)).toBe(0);
  });

  it("settles each title where its layout draws it", () => {
    // Whatever the travel, both end at rest — a title that stopped 8pt low
    // would be a header that never quite arrives.
    expect(restLift(0)).toBeCloseTo(0);
    expect(shutSettle(1)).toBe(0);
    expect(restLift(1)).toBeLessThan(0);
    expect(shutSettle(0)).toBeGreaterThan(0);
  });
});

describe("isCollapsed", () => {
  it("hands the pointer over once, at the midpoint", () => {
    expect(isCollapsed(HANDOVER - 0.01)).toBe(false);
    expect(isCollapsed(HANDOVER)).toBe(true);
  });

  it("gives the pointer to whichever layout can be seen", () => {
    // The invisible layer must never be the tappable one: that is a header
    // whose search button is wherever it used to be.
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const visible = isCollapsed(p) ? shutOpacity(p) : restOpacity(p);
      expect(visible, `the live layer is invisible at ${p.toFixed(2)}`).toBeGreaterThan(0);
    }
  });
});
