/**
 * **How tall a field is, as a function of the text scale it is showing.**
 *
 * A `TextInput` carries no `lineHeight` — on iOS that property moves where the
 * *value* is drawn without moving the placeholder, so a field sits correctly
 * until the first character and then drops toward its bottom edge a frame
 * later. `inputStep()` is the step without it.
 *
 * But something still has to say how tall the field is, and the two obvious
 * answers are both wrong:
 *
 * - **Nothing.** The box then takes the height the *loaded* face reports, so
 *   the same field measures one height against the fallback and another
 *   against IBM Plex. Four fields have no other height to fall back on, and a
 *   panel anchored under one of them lands a few pixels out on whichever runs
 *   lose that race.
 * - **A constant.** `02-tokens.md` states the rule this breaks: *line height is
 *   stated as a ratio, not as a second absolute*, because `allowFontScaling`
 *   scales `fontSize` and a fixed pair records the relationship nowhere —
 *   which is how a line box stays put while the glyphs in it grow. A Yoga
 *   `height` is a layout point value and is never multiplied by the text
 *   scale, so a constant clips every field at a large text setting.
 *   `display-hero` is a 57 box around 54 of glyph: it overflows at 1.06×.
 *
 * So the height is the ratio, resolved against the scale the platform is
 * actually showing. `type.test.ts`'s own predicate — a line box is never
 * smaller than the text it holds — then holds at every scale rather than only
 * at 1.
 *
 * **Capped where the text is capped.** A field that passes
 * `maxFontSizeMultiplier={textCap(step)}` stops growing its glyphs at that
 * multiple, so its box must stop there too, or a capped figure floats in a box
 * that keeps growing without it.
 *
 * **`useWindowDimensions` rather than `PixelRatio.getFontScale()`** because
 * Android can change the setting while the app is running, and a value read
 * once at mount would leave the box at the old scale until something else
 * re-rendered it. The subscription is why this is a hook and not part of
 * `makeStyles`: that one is cached per theme and deliberately builds a
 * stylesheet once, and giving all ~100 of its consumers a dimensions
 * subscription to serve ten fields is the wrong trade.
 *
 * On the web `fontScale` is 1 — `react-native-web` has no OS text scale — so
 * this resolves to the same constant the browser needs to keep layout off the
 * font-loading race.
 */

import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { lineHeightFor, maxFontScale, type TypeStep } from "../tokens.ts";

/**
 * The `height` a field showing `step` occupies at `fontScale`.
 *
 * Exported as arithmetic, and tested as arithmetic: `react-native-web` has no
 * OS text scale, so `fontScale` is 1 in every jsdom render and in every
 * screenshot. A test that went through the hook could therefore only ever
 * assert the one value that is already correct — the scales that clip are
 * reachable here and nowhere else.
 */
export function inputHeight(step: TypeStep, fontScale: number): number {
  const cap = maxFontScale[step];
  return lineHeightFor(step, cap === undefined ? fontScale : Math.min(fontScale, cap));
}

/**
 * The same figure for the scale the platform is showing right now.
 *
 * Spread it onto the same element that wears `inputStep(text…(step))`, and
 * pass the *same* step to both — they are two halves of one decision.
 */
export function useInputHeight(step: TypeStep): { readonly height: number } {
  const { fontScale } = useWindowDimensions();
  return useMemo(() => ({ height: inputHeight(step, fontScale) }), [fontScale, step]);
}
