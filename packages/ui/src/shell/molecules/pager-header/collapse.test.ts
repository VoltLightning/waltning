import { describe, expect, it } from "vitest";
import {
  CARET_SHUT_SCALE,
  COLLAPSE_TRAVEL,
  COLLAPSED_HEIGHT,
  caretScale,
  caretShiftX,
  chromeSlack,
  collapseProgress,
  EXPANDED_HEIGHT,
  headerHeight,
  MONTH_ROW,
  MONTH_SHUT_SCALE,
  monthScale,
  STEPPER_ARRIVES,
  STEPPER_IS_REAL_AT,
  stepperArrival,
  stepperIsReal,
  TITLE_GAP,
  TITLE_REST_BOTTOM,
  TITLE_SHUT_BOTTOM,
  titleTop,
  YEAR_LIFTS,
  YEAR_REST_SCALE,
  YEAR_ROW,
  YEAR_SLOT,
  yearLift,
  yearScale,
  yearShiftX,
  yearShiftY,
  yearSlide,
} from "./collapse.ts";

/** A month at `displayTwo` and a year at `displayThree`, in points. */
const MONTH_W = 118;
const YEAR_W = 34;

/** Every tenth of the travel, which is what a slow drag actually visits. */
function acrossTheTravel(): readonly number[] {
  const steps: number[] = [];
  for (let p = 0; p <= 1.0001; p += 0.05) steps.push(Math.min(p, 1));
  return steps;
}

describe("collapseProgress", () => {
  it("is 0 at rest", () => {
    expect(collapseProgress(0)).toBe(0);
  });

  it("clamps the rubber band", () => {
    // iOS bounces past the top on every flick. Without this the header would
    // be asked to draw itself taller than expanded, which the layout is not
    // built for.
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

describe("chromeSlack", () => {
  it("leaves the chrome the same footprint at every offset", () => {
    // The whole point, as one line: height minus what the margin takes back is
    // the collapsed height, always. That is what keeps the pager's layout box
    // identical while the header closes — and the pager's box is the scroll
    // viewport, which is what the scroller derives its largest offset from.
    //
    // Measured in Chrome before this existed, collapsing the header grew the
    // viewport from 640 to 676 in step with it, so the offset moved the
    // viewport and the viewport moved the offset. Afterwards the viewport is
    // 732 at both ends of the travel while the chrome still gives up its 36.
    for (const p of acrossTheTravel()) {
      expect(headerHeight(p) - chromeSlack(p), `at ${p.toFixed(2)}`).toBeCloseTo(COLLAPSED_HEIGHT);
    }
  });

  it("gives the whole travel back by the time the header has closed", () => {
    expect(chromeSlack(0)).toBe(COLLAPSE_TRAVEL);
    expect(chromeSlack(1)).toBe(0);
  });
});

describe("the title's three parts", () => {
  it("shrinks each of them, and never stretches one", () => {
    // Every part is laid out at its larger end. A scale above 1 would be a
    // raster stretched past the size it was drawn at, which is the one thing
    // this arrangement exists to avoid.
    for (const p of acrossTheTravel()) {
      expect(monthScale(p), `month at ${p.toFixed(2)}`).toBeLessThanOrEqual(1);
      expect(yearScale(p, MONTH_W), `year at ${p.toFixed(2)}`).toBeLessThanOrEqual(1);
      expect(caretScale(p), `caret at ${p.toFixed(2)}`).toBeLessThanOrEqual(1);
    }
  });

  it("draws each at the size its own step names, at both ends", () => {
    expect(monthScale(0)).toBe(1);
    expect(monthScale(1)).toBeCloseTo(MONTH_SHUT_SCALE);
    expect(yearScale(0, MONTH_W)).toBeCloseTo(YEAR_REST_SCALE);
    expect(yearScale(1, MONTH_W)).toBe(1);
    expect(caretScale(0)).toBe(1);
    expect(caretScale(1)).toBeCloseTo(CARET_SHUT_SCALE);
  });

  it("carries the year one way only", () => {
    // A word that advanced and then came back would read as a wobble, and a
    // reader holding the scroll mid-travel would be watching it happen. Stated
    // as the year's *top*, which is what stays still while it grows: under a
    // pinned top a taller box moves its own centre down, and asserting the
    // centre would call that growth a drop.
    //
    // And sideways as its distance *from the month*, not as an absolute
    // offset. The month is still shrinking after the year has finished
    // sliding, so a year glued one gap past its edge follows it back left by
    // the pixel and a half the month gives up — which is the year staying
    // where it belongs, and an absolute reading would call it a reversal.
    //
    // Only the year is asserted. The caret is not travelling anywhere of its
    // own — it is pinned to the end of the title, and where that is is the
    // caret's own tests.
    let clear = yearShiftX(0, MONTH_W) - MONTH_W * monthScale(0);
    let top = yearTop(0);
    for (const p of acrossTheTravel().slice(1)) {
      const nextClear = yearShiftX(p, MONTH_W) - MONTH_W * monthScale(p);
      const nextTop = yearTop(p);
      expect(nextClear, `the year went back at ${p.toFixed(2)}`).toBeGreaterThanOrEqual(clear);
      expect(nextTop, `the year dropped at ${p.toFixed(2)}`).toBeLessThanOrEqual(top + 0.001);
      clear = nextClear;
      top = nextTop;
    }
  });
});

describe("the year's travel", () => {
  it("starts under the month at the left edge", () => {
    // Which is also what an unmeasured header draws, so the mount is right
    // before `onLayout` has said anything.
    expect(yearShiftX(0, MONTH_W)).toBe(0);
    expect(yearShiftX(0, 0)).toBe(0);
  });

  it("ends one gap past the month's drawn edge", () => {
    expect(yearShiftX(1, MONTH_W)).toBeCloseTo(MONTH_W * MONTH_SHUT_SCALE + TITLE_GAP);
  });

  it("tracks the month's shrinking edge rather than aiming where it will stop", () => {
    // The year does not slide to a fixed destination and wait: at every offset
    // it is `yearSlide` of the way to one gap past wherever the month's edge
    // currently is. Aim at the month's *final* edge instead and the year
    // arrives under a month that has not finished shrinking yet.
    for (const p of acrossTheTravel()) {
      const monthEdge = MONTH_W * monthScale(p);
      expect(yearShiftX(p, MONTH_W), `at ${p.toFixed(2)}`).toBeCloseTo(
        yearSlide(p, MONTH_W) * (monthEdge + TITLE_GAP),
      );
    }
  });

  it("is clear of the month's line before it starts to rise", () => {
    // The two phases, stated as the thing they buy: nothing rises while the
    // year is still horizontally inside the month.
    expect(yearLift(YEAR_LIFTS, MONTH_W)).toBe(0);
    expect(yearSlide(YEAR_LIFTS, MONTH_W)).toBe(1);
    expect(yearShiftX(YEAR_LIFTS, MONTH_W)).toBeCloseTo(
      MONTH_W * monthScale(YEAR_LIFTS) + TITLE_GAP,
    );
  });

  it("lands centred on the month's row, from directly under it", () => {
    // Stated as centres because that is what the two ends actually describe:
    // a caption sitting under a line, and a word sitting on it.
    expect(yearCentre(0), "not a caption under the month").toBeCloseTo(
      MONTH_ROW + (YEAR_ROW * YEAR_REST_SCALE) / 2,
    );
    expect(yearCentre(1), "not on the month's row").toBeCloseTo(MONTH_ROW / 2);
  });

  it("never crosses the month", () => {
    // The defect this sequencing exists for, and the reason it is not a taste
    // question. Moved on one curve the year was two thirds of the way up into
    // the month's line while still only a third of the way across it, so
    // `2026` sat on top of `September` from .45 to .9 of the travel. At every
    // offset the year is either still clear *below* the month's line or clear
    // *right* of its drawn edge — reading the two interpolations does not tell
    // you that, and looking at the ends tells you nothing at all.
    for (const p of acrossTheTravel()) {
      const clearBelow =
        yearCentre(p) - (YEAR_ROW * yearScale(p, MONTH_W)) / 2 >= MONTH_ROW - 0.001;
      const clearRight = yearShiftX(p, MONTH_W) >= MONTH_W * monthScale(p) - 0.001;
      expect(clearBelow || clearRight, `the year is over the month at ${p.toFixed(2)}`).toBe(true);
    }
  });

  it("crosses the gap between them once, without overshooting either", () => {
    for (const p of acrossTheTravel()) {
      expect(yearCentre(p), `above the row at ${p.toFixed(2)}`).toBeGreaterThanOrEqual(
        MONTH_ROW / 2 - 0.001,
      );
      expect(yearCentre(p), `below the caption at ${p.toFixed(2)}`).toBeLessThanOrEqual(
        MONTH_ROW + YEAR_ROW / 2 + 0.001,
      );
    }
  });
});

/**
 * Where the year's drawn centre sits, in the title block's own coordinates —
 * the month's row spanning `0` to `MONTH_ROW`.
 *
 * The layout puts the year's box directly under that row at its `displayThree`
 * height, so its untransformed centre is one row plus half a line down; the
 * shift is measured from there.
 */
function yearCentre(progress: number): number {
  return MONTH_ROW + YEAR_ROW / 2 + yearShiftY(progress, MONTH_W);
}

/** The top of that same drawn box — what stays pinned while the year grows. */
function yearTop(progress: number): number {
  return yearCentre(progress) - (YEAR_ROW * yearScale(progress, MONTH_W)) / 2;
}

describe("the header clips, so everything drawn has to fit inside it", () => {
  it("keeps the whole year inside the header at every offset", () => {
    // **The defect this file exists to make impossible to reintroduce.** The
    // header is `overflow: hidden` over an animated height, so a part drawn
    // past its bottom edge is silently cut — no error, no warning, and both
    // ends of the travel still look perfect.
    //
    // It shipped once: sized on the slide, the year reached its full 22pt
    // while `titleTop` had already taken back most of the 20pt slot it sat in,
    // and 7 of those 22 points were outside the box at the midpoint. The
    // digits were cut above their baseline for scrollY 7 through 24 — a third
    // of the travel — and the `Mid Travel` baseline recorded it as correct.
    for (const p of acrossTheTravel()) {
      const bottom = titleTop(p, MONTH_W) + yearCentre(p) + (YEAR_ROW * yearScale(p, MONTH_W)) / 2;
      expect(bottom, `the year is cut at ${p.toFixed(2)}`).toBeLessThanOrEqual(
        headerHeight(p) + 0.001,
      );
    }
  });

  it("keeps the month's row inside it too", () => {
    for (const p of acrossTheTravel()) {
      expect(titleTop(p, MONTH_W), `above the header at ${p.toFixed(2)}`).toBeGreaterThanOrEqual(0);
      expect(
        titleTop(p, MONTH_W) + MONTH_ROW,
        `below the header at ${p.toFixed(2)}`,
      ).toBeLessThanOrEqual(headerHeight(p) + 0.001);
    }
  });
});

describe("a header that has not been measured", () => {
  // `onLayout` is not reliable in this tree — `pager.tsx` records it failing
  // silently on the scroller. A width of `0` therefore has to mean *no
  // measurement*, and the whole title has to have a shape it can draw without
  // one. Read as a real width instead, the collapsed year lands at x = 6 —
  // on top of the month, with the caret inside it.

  it("keeps the resting shape at every offset", () => {
    for (const p of acrossTheTravel()) {
      expect(yearShiftX(p, 0), `the year moved at ${p.toFixed(2)}`).toBe(0);
      expect(yearShiftY(p, 0), `the year rose at ${p.toFixed(2)}`).toBeCloseTo(yearShiftY(0, 0));
      expect(yearScale(p, 0), `the year grew at ${p.toFixed(2)}`).toBeCloseTo(YEAR_REST_SCALE);
      expect(titleTop(p, 0) + MONTH_ROW + YEAR_SLOT + TITLE_REST_BOTTOM).toBeCloseTo(
        headerHeight(p),
      );
    }
  });

  it("still fits inside the header, which is the state that made it safe", () => {
    for (const p of acrossTheTravel()) {
      const bottom = titleTop(p, 0) + MONTH_ROW + YEAR_ROW * YEAR_REST_SCALE;
      expect(bottom, `cut at ${p.toFixed(2)}`).toBeLessThanOrEqual(headerHeight(p) + 0.001);
    }
  });

  it("leaves the caret against the month, since nothing has moved past it", () => {
    for (const p of acrossTheTravel()) {
      expect(caretShiftX(p, 0, YEAR_W), `at ${p.toFixed(2)}`).toBe(0);
    }
  });
});

describe("the caret", () => {
  it("sits against the month while the month is alone on the row", () => {
    expect(caretShiftX(0, MONTH_W, YEAR_W)).toBe(0);
  });

  it("follows the month's edge where the period has no year", () => {
    // Months names the year in the label itself, so `2026` under `2026` is
    // dropped — and the caret then has nothing to clear but the month.
    expect(caretShiftX(1, MONTH_W, 0)).toBeCloseTo(MONTH_W * (MONTH_SHUT_SCALE - 1));
  });

  it("clears the year once the year has joined the row", () => {
    expect(caretShiftX(1, MONTH_W, YEAR_W)).toBeCloseTo(
      MONTH_W * (MONTH_SHUT_SCALE - 1) + YEAR_W + TITLE_GAP,
    );
  });

  it("opens the space ahead of the year rather than being pushed by it", () => {
    // The caret leads the arrival: it clears the month by a gap at rest and
    // the year by a gap at the end, and in between it is already far enough
    // right that the year slides into room that is there rather than shoving
    // the caret along in front of it. So the two never touch, and the caret
    // never backs into the month either.
    for (const p of acrossTheTravel()) {
      const monthRight = MONTH_W * monthScale(p);
      const yearRight = yearShiftX(p, MONTH_W) + YEAR_W * yearScale(p, MONTH_W);
      const caretLeft = MONTH_W + TITLE_GAP + caretShiftX(p, MONTH_W, YEAR_W);
      expect(caretLeft, `caret over the month at ${p.toFixed(2)}`).toBeGreaterThanOrEqual(
        monthRight + TITLE_GAP - 0.001,
      );
      expect(caretLeft, `caret over the year at ${p.toFixed(2)}`).toBeGreaterThanOrEqual(
        yearRight - 0.001,
      );
    }
  });

  it("ends against whichever of the two the title ends with", () => {
    const monthOnly = MONTH_W * MONTH_SHUT_SCALE + TITLE_GAP;
    expect(MONTH_W + TITLE_GAP + caretShiftX(0, MONTH_W, YEAR_W)).toBeCloseTo(MONTH_W + TITLE_GAP);
    expect(MONTH_W + TITLE_GAP + caretShiftX(1, MONTH_W, YEAR_W)).toBeCloseTo(
      monthOnly + YEAR_W + TITLE_GAP,
    );
    expect(MONTH_W + TITLE_GAP + caretShiftX(1, MONTH_W, 0)).toBeCloseTo(monthOnly);
  });
});

describe("titleTop", () => {
  it("anchors the group to the header's bottom at both ends", () => {
    // The search button and the stepper keep the bottom 48pt at every offset;
    // a title that drifted away from them would stop reading as their row.
    expect(titleTop(0, MONTH_W) + MONTH_ROW + YEAR_SLOT + TITLE_REST_BOTTOM).toBeCloseTo(
      EXPANDED_HEIGHT,
    );
    expect(titleTop(1, MONTH_W) + MONTH_ROW + TITLE_SHUT_BOTTOM).toBeCloseTo(COLLAPSED_HEIGHT);
  });

  it("centres the collapsed title on the row the controls keep", () => {
    // The one number a reader would actually notice if it were wrong: the
    // month and the magnifier sit on the same line, or the header looks
    // broken. The controls are a 48pt row against the header's bottom, so
    // their centre is 24 up from it and the month's has to be the same.
    const rowCentre = COLLAPSED_HEIGHT - (titleTop(1, MONTH_W) + MONTH_ROW / 2);
    expect(rowCentre).toBeCloseTo(COLLAPSED_HEIGHT / 2);
  });

  it("keeps the title inside the header the whole way", () => {
    for (const p of acrossTheTravel()) {
      expect(titleTop(p, MONTH_W), `above the header at ${p.toFixed(2)}`).toBeGreaterThanOrEqual(0);
      expect(
        titleTop(p, MONTH_W) + MONTH_ROW,
        `below the header at ${p.toFixed(2)}`,
      ).toBeLessThanOrEqual(headerHeight(p));
    }
  });

  it("rises as the header closes", () => {
    let previous = titleTop(0, MONTH_W);
    for (const p of acrossTheTravel().slice(1)) {
      const next = titleTop(p, MONTH_W);
      expect(next, `the title dropped at ${p.toFixed(2)}`).toBeLessThanOrEqual(previous);
      previous = next;
    }
  });
});

describe("the stepper", () => {
  it("is absent while the header is still a title", () => {
    expect(stepperArrival(0)).toBe(0);
    expect(stepperIsReal(0)).toBe(false);
  });

  it("is fully there once the header has closed", () => {
    expect(stepperArrival(1)).toBe(1);
    expect(stepperIsReal(1)).toBe(true);
  });

  it("is never real while it cannot be seen", () => {
    // The invisible control must never be the tappable one: that is a header
    // offering *previous month* on a screen with no arrow drawn on it.
    //
    // **Stated as a floor on the opacity, not as a restatement of the
    // definition.** `stepperIsReal(p) === (stepperArrival(p) > 0)` was the
    // first spelling and it could not fail — it asserted the body of the
    // function against itself, and it passed just as happily while the control
    // was becoming tappable at an opacity of two parts in a billion.
    for (const p of acrossTheTravel()) {
      if (!stepperIsReal(p)) continue;
      expect(stepperArrival(p), `real but invisible at ${p.toFixed(2)}`).toBeGreaterThanOrEqual(
        STEPPER_IS_REAL_AT,
      );
    }
  });

  it("disagrees with its own opacity either side of the threshold", () => {
    // Proof the check above can fail. There is a band where the stepper is
    // drawn and deliberately not yet real; without it the floor above would be
    // satisfied by a boolean that simply followed the opacity.
    const arriving = STEPPER_ARRIVES + (1 - STEPPER_ARRIVES) * (STEPPER_IS_REAL_AT / 2);
    expect(stepperArrival(arriving)).toBeGreaterThan(0);
    expect(stepperIsReal(arriving)).toBe(false);
  });
});

describe("the header never goes blank", () => {
  it("draws the month at full opacity at every offset", () => {
    // The whole reason this file stopped describing two cross-faded layers.
    // The old pair met at zero: at the midpoint of the travel the bar was
    // empty, and across 14 of its 36 points the month was under half lit.
    // There is one month now, and its opacity is not a function of anything.
    for (const p of acrossTheTravel()) {
      expect(monthScale(p), `the month vanished at ${p.toFixed(2)}`).toBeGreaterThan(0);
    }
  });
});
