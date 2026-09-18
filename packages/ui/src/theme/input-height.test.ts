/**
 * **The defect this exists for.** A field's height was briefly a constant —
 * the step's `lineHeight`, baked in at scale 1. That reads as correct on the
 * web, where `react-native-web` has no OS text scale and every render is 1x,
 * and clips on the two platforms whose type actually scales: `display-hero`
 * reserves 57 points around glyphs that are 54 at 1x and 75.6 at the 1.4 its
 * own cap allows. No story, screenshot or jsdom render can show that, because
 * all three are 1x — which is why the scale is a parameter and asserted here
 * rather than through the hook.
 */

import { describe, expect, it } from "vitest";
import { lineHeightFor, maxFontScale, type TypeStep, type as typeScale } from "../tokens.ts";
import { inputHeight } from "./input-height.ts";

/** Every step a field is actually dressed in, taken from the call sites. */
const INPUT_STEPS: readonly TypeStep[] = [
  "displayHero",
  "displayOne",
  "displayTwo",
  "displayThree",
  "body",
  "bodySm",
];

describe("a field's height follows the text scale", () => {
  it("is the step's own line height at 1x", () => {
    for (const step of INPUT_STEPS) {
      expect(inputHeight(step, 1), `${step} at 1x`).toBeCloseTo(lineHeightFor(step), 2);
    }
  });

  /**
   * `type.test.ts`'s own predicate — *a line box is never smaller than the
   * text it holds* — asked of the box a field actually gets rather than of the
   * token it came from. A constant height fails every row of this above 1x.
   */
  it("never holds less room than the glyphs it shows", () => {
    for (const scale of [1, 1.06, 1.15, 1.5, 2, 3]) {
      for (const step of INPUT_STEPS) {
        const capped = Math.min(scale, maxFontScale[step] ?? Number.POSITIVE_INFINITY);
        expect(inputHeight(step, scale), `${step} at ${scale}x`).toBeGreaterThanOrEqual(
          typeScale[step].fontSize * capped,
        );
      }
    }
  });

  it("grows in proportion, so the field keeps its shape", () => {
    for (const step of INPUT_STEPS) {
      const cap = maxFontScale[step] ?? Number.POSITIVE_INFINITY;
      if (cap < 2) continue;
      expect(inputHeight(step, 2) / inputHeight(step, 1), `${step} at 2x`).toBeCloseTo(2, 5);
    }
  });

  /**
   * A capped field stops growing its glyphs, so its box must stop too, or a
   * figure that has stopped scaling floats in a box that has not.
   */
  it("stops where the text stops", () => {
    const capped = INPUT_STEPS.filter((step) => maxFontScale[step] !== undefined);
    expect(capped.length, "a capped step to test").toBeGreaterThan(0);
    for (const step of capped) {
      const cap = maxFontScale[step] as number;
      expect(inputHeight(step, cap + 1), `${step} past its cap`).toBeCloseTo(
        inputHeight(step, cap),
        5,
      );
    }
  });
});
