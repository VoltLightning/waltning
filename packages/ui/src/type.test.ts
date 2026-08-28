/**
 * The type scale — that it still says what `design-system/02` §2.2 says, and
 * that it survives the OS text-size setting.
 */

import { describe, expect, it } from "vitest";
import { lineHeightFor, maxFontScale, type TypeStep, type } from "./tokens.ts";

/**
 * §2.2's published pairs, transcribed.
 *
 * The scale now stores a **ratio** rather than a second absolute, because a
 * pair of fixed numbers cannot scale — `allowFontScaling` defaults to `true`,
 * so the platform moves `fontSize` and the relationship between the two was
 * recorded nowhere. This table is the evidence that the change was
 * representational and not a redesign: every derived line height must land back
 * on the number the design system published.
 */
const PUBLISHED: Record<TypeStep, [size: number, lineHeight: number]> = {
  displayHero: [54, 57],
  displayOne: [38, 42],
  displayTwo: [23, 28],
  displayThree: [17, 22],
  body: [16, 24],
  bodySm: [14.5, 22],
  caption: [12, 16],
  kicker: [11, 13],
  tag: [10.5, 10.5],
};

describe("the scale is unchanged at the default text size", () => {
  it("every step derives the line height §2.2 published", () => {
    for (const [step, [size, lineHeight]] of Object.entries(PUBLISHED) as [
      TypeStep,
      [number, number],
    ][]) {
      expect(type[step].fontSize, `${step} font size`).toBe(size);
      expect(lineHeightFor(step), `${step} line height`).toBeCloseTo(lineHeight, 2);
    }
  });

  it("covers every step, so a new one cannot be added unchecked", () => {
    // Without this the table above could fall behind the scale and the test
    // would keep passing over whatever it still happened to contain.
    expect(Object.keys(type).sort()).toEqual(Object.keys(PUBLISHED).sort());
  });
});

describe("the scale scales", () => {
  it("a line height grows with the text, keeping its proportion", () => {
    for (const step of Object.keys(type) as TypeStep[]) {
      const at1 = lineHeightFor(step, 1);
      const at2 = lineHeightFor(step, 2);
      expect(at2 / at1, `${step} at 2x`).toBeCloseTo(2, 5);
    }
  });

  /**
   * **The failure this replaces.** Absolute pairs meant the line box stayed put
   * while the glyphs grew — so at a large text setting the descenders clip and
   * consecutive lines overlap. `body` is the case that matters most, because it
   * is the setting's whole point.
   */
  it("a line box is never smaller than the text it holds", () => {
    for (const scale of [1, 1.5, 2, 3]) {
      for (const step of Object.keys(type) as TypeStep[]) {
        const box = lineHeightFor(step, scale);
        const glyphs = type[step].fontSize * scale;
        // `tag` sits exactly at 1.0 and is allowed to: it is uppercase-only, so
        // there are no descenders to clip. Everything else must have room.
        expect(box, `${step} at ${scale}x`).toBeGreaterThanOrEqual(glyphs);
      }
    }
  });
});

describe("the growth cap is a decision, and stated per step", () => {
  it("body text is never capped", () => {
    // Capping body text defeats the setting for exactly the person who turned
    // it up. If this ever fails, someone applied a global multiplier.
    expect(maxFontScale.body, "body must grow without limit").toBeUndefined();
    expect(maxFontScale.bodySm).toBeUndefined();
    expect(maxFontScale.caption).toBeUndefined();
  });

  it("the display steps are capped, hero hardest", () => {
    const hero = maxFontScale.displayHero;
    const one = maxFontScale.displayOne;
    const two = maxFontScale.displayTwo;

    expect(hero, "displayHero cap").toBeDefined();
    if (hero === undefined || one === undefined || two === undefined)
      throw new Error("unreachable");

    // Bigger type is capped tighter — it already dominates the screen, and at
    // 54pt an uncapped 2x is 108pt in a layout built for 54.
    expect(hero).toBeLessThan(one);
    expect(one).toBeLessThan(two);
    // A cap below 1 would shrink text someone asked to enlarge.
    expect(hero).toBeGreaterThan(1);
  });
});
