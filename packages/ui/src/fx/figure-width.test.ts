/**
 * **The property that matters is monotonic, even growth.** The currency affix
 * sits immediately after the field this sizes, so any character whose reserved
 * width differs from its drawn width moves the marker by the error. The old
 * estimate counted the decimal mark as a full tabular digit, and the marker
 * jumped ~0.4em the moment one was typed.
 */

import { describe, expect, it } from "vitest";
import { CARET_EM, DIGIT_EM, MARK_EM } from "../tokens.ts";
import { figureEm } from "./figure-width.ts";

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
