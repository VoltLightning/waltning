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

import { CARET_EM, DIGIT_EM, MARK_EM } from "../tokens.ts";

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
