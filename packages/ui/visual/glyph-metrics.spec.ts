/**
 * **The font-metric constants, measured against the font.**
 *
 * `figure-width.ts` sizes a typed amount's field from `DIGIT_EM` and
 * `MARK_EM` — fractions of the font size, hardcoded. Its unit test checks the
 * arithmetic *around* them and cannot check the numbers themselves, because
 * jsdom has no font. So a wrong constant was invisible: `MARK_EM` shipped at
 * `0.21` on the reasoning that a comma is "about a third" of a digit, when the
 * real advance is `0.299`. The box grew 11.4px where the glyph needed 16.1 at
 * `display-hero`, the text ran wider than its own box, and the figure looked
 * like it jumped under the thumb.
 *
 * A canvas in the browser knows the answer exactly. This asks it, in the
 * field's *own computed font* rather than a font named here — a constant that
 * matches a font the app does not use is the same bug wearing a passing test.
 */

import { expect, test } from "@playwright/test";
import { CARET_EM, DIGIT_EM, MARK_EM } from "../src/tokens.ts";

/** Two decimal places: enough to catch a wrong glyph, loose enough for hinting. */
const PLACES = 2;

test("the amount field's own font measures what the tokens claim", async ({ page }) => {
  await page.goto("/iframe.html?id=transactions-quickaddcomposer--empty&viewMode=story");
  await page.waitForSelector("#storybook-root input");
  // **Fonts first, or the canvas measures a fallback.** This passed alone and
  // failed inside the suite until this line: under load the web font has not
  // arrived when the story renders, and a canvas asked then reports the system
  // face's advances — which are not `IBMPlexSans`'s and not what the tokens
  // describe. `stories.spec.ts`'s own `settle()` waits on exactly this.
  await page.evaluate(() => document.fonts.ready);

  const measured = await page.evaluate(() => {
    const input = document.querySelector("#storybook-root input");
    if (input === null) throw new Error("glyph-metrics.spec.ts: no amount input to measure");
    const style = getComputedStyle(input);
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) throw new Error("glyph-metrics.spec.ts: no 2d context");
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const size = Number.parseFloat(style.fontSize);
    const advance = (glyph: string) => context.measureText(glyph).width / size;
    return {
      digits: ["0", "1", "2", "8", "9"].map(advance),
      comma: advance(","),
      dot: advance("."),
      variant: style.fontVariantNumeric,
    };
  });

  // Tabular first: if the digits differ from each other, one `DIGIT_EM` cannot
  // be right for all of them and the whole approach is unsound.
  expect(measured.variant).toContain("tabular-nums");
  for (const digit of measured.digits) {
    expect(digit, "every tabular digit has one advance").toBeCloseTo(DIGIT_EM, PLACES);
  }

  expect(measured.comma, "MARK_EM against the comma").toBeCloseTo(MARK_EM, PLACES);
  expect(measured.dot, "MARK_EM against the full stop").toBeCloseTo(MARK_EM, PLACES);

  // The caret allowance is room, not a glyph — it only has to be room.
  expect(CARET_EM).toBeGreaterThan(0);
  expect(CARET_EM).toBeLessThan(DIGIT_EM);
});
