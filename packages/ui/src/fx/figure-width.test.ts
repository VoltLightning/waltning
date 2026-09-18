/**
 * **The property that matters is monotonic, even growth.** The currency affix
 * sits immediately after the field this sizes, so any character whose reserved
 * width differs from its drawn width moves the marker by the error. The old
 * estimate counted the decimal mark as a full tabular digit, and the marker
 * jumped ~0.4em the moment one was typed.
 */

import { describe, expect, it } from "vitest";
import { CARET_EM, DIGIT_EM, MARK_EM, type as typeScale } from "../tokens.ts";
import { figureEm, figureWidth } from "./figure-width.ts";

/**
 * **These check the arithmetic, never the constants.** jsdom has no font, so
 * nothing here can tell whether `MARK_EM` matches a real comma — and for a
 * while it did not: `0.21` against a measured `0.299`, which is what made the
 * figure jump. `visual/glyph-metrics.spec.ts` measures them in a browser,
 * against the field's own computed font. Neither file is enough alone.
 */

describe("figureEm", () => {
  it("measures a digit as a digit and the mark as a mark", () => {
    expect(figureEm("48")).toBeCloseTo(2 * DIGIT_EM + CARET_EM, 5);
    expect(figureEm("48,20")).toBeCloseTo(4 * DIGIT_EM + MARK_EM + CARET_EM, 5);
  });

  /** The defect, stated as a number: the mark must not cost a digit. */
  it("does not charge a digit's width for the decimal mark", () => {
    const beforeMark = figureEm("48");
    const afterMark = figureEm("48,");
    expect(afterMark - beforeMark).toBeCloseTo(MARK_EM, 5);
    expect(afterMark - beforeMark).toBeLessThan(DIGIT_EM / 2);
  });

  /** A full stop is a mark too — the locale decides which glyph, not this. */
  it("measures either decimal mark the same way", () => {
    expect(figureEm("48.20")).toBeCloseTo(figureEm("48,20"), 5);
  });

  /**
   * An empty field draws a `0` placeholder. If it reserved less than a digit,
   * the affix would start left of where the first keystroke puts it and the
   * first character would move it — the jump this whole file exists to remove.
   */
  it("never reserves less than the placeholder it shows", () => {
    expect(figureEm("")).toBeCloseTo(DIGIT_EM + CARET_EM, 5);
    expect(figureEm("")).toBeLessThanOrEqual(figureEm("4"));
  });

  /** Typing only ever widens the field; a shrink would pull the affix back. */
  it("grows with every character and never shrinks", () => {
    const typed = ["", "4", "48", "48,", "48,2", "48,20"];
    const widths = typed.map(figureEm);
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i], `${typed[i]} after ${typed[i - 1]}`).toBeGreaterThanOrEqual(
        widths[i - 1] as number,
      );
    }
  });
});

/**
 * **What a review measured in Chrome, pinned as arithmetic.** The width was
 * briefly `figureEm(display) × fontSize` — no tracking, no scale. Measured
 * against the rendered run, the gap before the affix was 5.40px on the
 * placeholder and 9.71px on a five-character figure, where it is supposed to be
 * the caret allowance and nothing else: the affix drifted right by one tracking
 * step on every keystroke, reaching ~19.5px at `maxLength`.
 */
describe("a figure's width in points", () => {
  it("leaves the caret exactly its allowance, whatever the length", () => {
    for (const display of ["0", "4", "48", "48,9", "48,90", "123456789,12"]) {
      const characters = [...display].length;
      const run =
        (figureEm(display) - CARET_EM) * typeScale.displayHero.fontSize +
        typeScale.displayHero.letterSpacing * characters;
      const gap = figureWidth("displayHero", display, 1) - run;
      expect(gap, `caret allowance behind "${display}"`).toBeCloseTo(
        CARET_EM * typeScale.displayHero.fontSize,
        5,
      );
    }
  });

  it("grows with the text, up to the step's cap", () => {
    const at1 = figureWidth("displayHero", "48,90", 1);
    expect(figureWidth("displayHero", "48,90", 1.4) / at1, "at its cap").toBeCloseTo(1.4, 5);
    expect(figureWidth("displayHero", "48,90", 3), "past its cap").toBeCloseTo(at1 * 1.4, 5);
  });

  it("never reserves less than the glyphs it shows", () => {
    for (const scale of [1, 1.2, 1.4]) {
      for (const display of ["0", "48,90", "1234567890,12"]) {
        const characters = [...display].length;
        const run =
          ((figureEm(display) - CARET_EM) * typeScale.displayHero.fontSize +
            typeScale.displayHero.letterSpacing * characters) *
          Math.min(scale, 1.4);
        expect(
          figureWidth("displayHero", display, scale),
          `"${display}" at ${scale}x`,
        ).toBeGreaterThan(run);
      }
    }
  });
});
