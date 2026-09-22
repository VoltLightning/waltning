/**
 * `<FigureInput>` — a figure being typed, at a display size: *How much?* on
 * Add, *Leaves* and *Arrives* on Transfer.
 *
 * **The figure is drawn as text, and the input lies over it unseen.** The sign,
 * the digits and the currency are `Text`s in one row — so they share a baseline
 * by construction, on every platform — and a transparent `TextInput` covers the
 * row to take the typing. Three attempts to do it the other way round each
 * failed on a device:
 *
 * 1. The sign was mounted on the first keystroke, and every later digit sat a
 *    glyph to the right of the first. It became always-mounted and invisible.
 * 2. The input's width was *estimated* from per-character em constants
 *    (`fx/figure-width.ts`), twice, and was wrong on whichever renderer it had
 *    not been measured on; a field whose width changes under a keystroke
 *    re-lays its own content, which is the figure jumping as it is typed — on
 *    both phones.
 * 3. A `Text` sign baseline-aligned against a `TextInput` does not align on
 *    Android, where an input's line box is its own: the minus sat on the
 *    baseline like an underscore.
 *
 * Text beside text has none of those failure modes, because nothing is
 * measured and nothing is an input's line box. What it costs is the caret's
 * position: the input is hidden, so the caret is drawn — a bar after the last
 * digit — and typing is at the end, which is how an amount is typed anyway.
 */

import { type ReactNode, useMemo } from "react";
import { Text, View } from "react-native";
import { SheetAwareTextInput } from "../../../primitives/sheet-input";
import { inputStep, text, textCap } from "../../../theme/fonts.ts";
import { useInputHeight } from "../../../theme/input-height.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, tabularNums, touchTarget, unseenInk } from "../../../tokens.ts";

export type FigureStep = "displayHero" | "displayOne" | "displayTwo";

export type FigureInputProps = {
  /** The control's accessible name. */
  label: string;
  /** What is shown and typed into — already in the locale's decimal mark. */
  value: string;
  onChangeText: (typed: string) => void;
  step: FigureStep;
  maxLength: number;
  /**
   * The direction, drawn in front. **Always mounted, invisible while empty**: a
   * sign that appeared on the first keystroke pushed every later digit
   * sideways.
   */
  sign?: { glyph: "−" | "+"; color: string };
  /** The currency, after the figure — sized by the caller, on the same baseline. */
  affix?: ReactNode;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  autoFocus?: boolean;
};

export function FigureInput({
  label,
  value,
  onChangeText,
  step,
  maxLength,
  sign,
  affix,
  focused,
  onFocus,
  onBlur,
  autoFocus = false,
}: FigureInputProps) {
  const styles = useStyles();
  const inputHeight = useInputHeight(step);
  const empty = value === "";
  const type =
    step === "displayHero" ? styles.hero : step === "displayOne" ? styles.one : styles.two;
  const signColor = sign?.color;
  const signInk = useMemo(
    () => (signColor === undefined ? null : { color: signColor }),
    [signColor],
  );

  return (
    <View style={styles.figure}>
      {/*
        Drawn, and hidden from a screen reader: the input over it is the
        control, and it carries the label and the value.
      */}
      <View style={styles.drawn} {...DRAWN}>
        {sign === undefined ? null : (
          <Text
            maxFontSizeMultiplier={textCap(step)}
            style={[type, signInk, empty ? styles.signEmpty : null]}
          >
            {sign.glyph}
          </Text>
        )}
        <Text
          maxFontSizeMultiplier={textCap(step)}
          numberOfLines={1}
          style={[styles.digits, type, empty ? styles.placeholder : null]}
        >
          {empty ? "0" : value}
        </Text>
        {focused ? (
          <View
            style={[
              styles.caret,
              step === "displayHero"
                ? styles.caretHero
                : step === "displayOne"
                  ? styles.caretOne
                  : styles.caretTwo,
            ]}
          />
        ) : null}
        {affix}
      </View>
      <SheetAwareTextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={maxLength}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onBlur={onBlur}
        // Typing is at the end, so the caret is the drawn one; the system's
        // would sit at a position in text nobody can see.
        caretHidden
        contextMenuHidden
        // Named in the array, not through a variable: the rule that every input
        // is dressed by `inputStep` reads the styles an input *wears* from here.
        style={[
          styles.input,
          step === "displayHero" ? styles.inputHero : null,
          step === "displayOne" ? styles.inputOne : null,
          step === "displayTwo" ? styles.inputTwo : null,
          inputHeight,
          styles.inkless,
        ]}
      />
    </View>
  );
}

/** The drawn figure is a picture of the input's value: not read out twice. */
const DRAWN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  "aria-hidden": true,
} as const;

/**
 * How tall a figure's digits stand, as a share of its size: lining numerals
 * reach the cap height, which in the display face is 0.7 of the em.
 */
const CAP_EM = 0.7;

function capOf(step: "displayHero" | "displayOne" | "displayTwo"): number {
  return Math.round(text.display(step).fontSize * CAP_EM);
}

/** Above iOS's hit-testing floor of `0.01`; see `input` below. */
const TOUCHABLE_AND_UNSEEN = 0.02;

const useStyles = makeStyles((theme) => ({
  figure: { minHeight: touchTarget.min, justifyContent: "center" },
  hero: { ...text.display("displayHero") },
  one: { ...text.display("displayOne") },
  two: { ...text.display("displayTwo") },
  // The input is never seen, and is dressed like any other all the same: it is
  // what a screen reader and the platform's own text services are talking to.
  inputHero: { ...inputStep(text.display("displayHero")) },
  inputOne: { ...inputStep(text.display("displayOne")) },
  inputTwo: { ...inputStep(text.display("displayTwo")) },
  drawn: { flexDirection: "row", alignItems: "baseline", gap: space.md },
  signEmpty: { opacity: 0 },
  digits: { flexShrink: 1, color: theme.text, fontVariant: [...tabularNums] },
  // `textMuted`, never `textFaint`: a placeholder is read.
  placeholder: { color: theme.textMuted },
  // After the last digit: where the next key lands.
  /*
    After the last digit: where the next key lands. **On the baseline, not in
    the middle of the row.** A view's baseline is its bottom edge, so in a
    baseline row this bar stands on the line the digits stand on and is as
    tall as they are. Centred instead, it followed the row's box — and on iOS
    that box carries the line's space under the glyphs, so the bar hung below
    the figure it belongs to.
  */
  caret: {
    alignSelf: "baseline",
    width: 2,
    marginLeft: -space.sm,
    borderRadius: radius.xs,
    backgroundColor: theme.focusRing,
  },
  caretHero: { height: capOf("displayHero") },
  caretOne: { height: capOf("displayOne") },
  caretTwo: { height: capOf("displayTwo") },
  /*
    Over the whole row, so a tap anywhere on the figure focuses it — and
    invisible: `opacity` rather than a transparent colour, because a transparent
    input still draws its selection handles on Android.

    **Almost none, not none.** iOS leaves a view out of hit-testing at an alpha
    of `0.01` or under, so at `0` the figure took its first focus from
    `autoFocus` and could never be given another: once the keyboard was sent
    away, no tap reached the input again. `0.02` is the other side of that
    line and is still nothing anyone can see.
  */
  input: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: TOUCHABLE_AND_UNSEEN,
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  // Last, over the step's own ink: two hundredths of a hero figure in full ink
  // is a smudge beside the sign. **Nearly clear, not `transparent`** — Android
  // reads a zero colour on an input as *unset* and draws the default ink. The
  // handles have no colour to clear, which is why this is as well as the
  // opacity and not instead of it.
  inkless: { color: unseenInk },
}));
