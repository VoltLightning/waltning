/**
 * How wide a typed figure's field must be, in ems of its own font size.
 *
 * **A field that is sized per character has to measure the characters.** The
 * currency affix in `AmountCard` sits immediately after the `TextInput`, so the
 * box's width *is* where the marker lands — and an estimate that treats every
 * character as a tabular digit moves the marker by the error on each keystroke.
 * Plex's tabular digits are all exactly `DIGIT_EM`; the decimal mark is about a
 * third of that. Counting it as a digit made the affix jump by ~0.4em the
 * moment a comma was typed, which is the "jagged" a reader feels rather than
 * sees.
 *
 * The caret's room is added once, at the end. Folding it into an over-estimate
 * on one character is what produced the jump it was meant to prevent.
 */

import { CARET_EM, DIGIT_EM, MARK_EM, maxFontScale, type TypeStep, type } from "../tokens.ts";

/** The steps a typed figure is ever set in. */
export type FigureStep = Extract<TypeStep, "displayHero" | "displayOne" | "displayTwo">;

/**
 * `display` is the raw string in the field — digits and at most one decimal
 * mark, in whichever mark the locale uses. Anything that is not a digit is
 * measured as a mark, because that is the only other thing `parseAmount` lets
 * through.
 */
export function figureEm(display: string): number {
  let em = CARET_EM;
  for (const character of display) {
    em += character >= "0" && character <= "9" ? DIGIT_EM : MARK_EM;
  }
  // An empty field still shows a `0` placeholder, so it is never narrower than
  // one digit — otherwise the affix starts left of where the first keystroke
  // will put it, and the first character moves it.
  return Math.max(DIGIT_EM + CARET_EM, em);
}

/**
 * The same figure in points, at the text scale the platform is showing.
 *
 * **Ems alone are not a width**, and the two things that turn them into one
 * are both easy to leave out:
 *
 * - **Tracking.** Every display step is tracked negative — `display-hero` by
 *   -1.08 at 54 — and the renderer applies that after every character, so a
 *   run is narrower than the sum of its advances by the tracking times the
 *   character count. A width that ignores it leaves a gap that grows by one
 *   tracking step per keystroke: the affix marches right as you type, which is
 *   exactly the jitter `MARK_EM` was measured to stop, reintroduced in a
 *   smaller denomination.
 * - **The text scale.** `fontSize` is the size at 1x. A field that reserves
 *   `em × 54` while its glyphs are drawn at `54 × 1.4` is a box 40% short of
 *   its own contents, and the figure scrolls inside itself while the affix
 *   sits where the digits used to end. Capped where the step is capped, for
 *   the same reason the height is.
 */
export function figureWidth(step: FigureStep, display: string, fontScale: number): number {
  const tokens = type[step];
  const cap = maxFontScale[step];
  const scale = cap === undefined ? fontScale : Math.min(fontScale, cap);
  const tracking = "letterSpacing" in tokens ? tokens.letterSpacing : 0;
  // The placeholder `0` is a character too: an empty field is tracked like the
  // one digit it is showing, or the affix moves on the first keystroke.
  const characters = Math.max(1, [...display].length);
  return (figureEm(display) * tokens.fontSize + tracking * characters) * scale;
}
