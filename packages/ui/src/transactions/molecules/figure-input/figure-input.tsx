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
import { radius, space, tabularNums, touchTarget } from "../../../tokens.ts";

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
        {focused ? <View style={styles.caret} /> : null}
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
  caret: {
    alignSelf: "center",
    width: 2,
    height: "70%",
    marginLeft: -space.sm,
    borderRadius: radius.xs,
    backgroundColor: theme.focusRing,
  },
  /*
    Over the whole row, so a tap anywhere on the figure focuses it — and
    invisible: `opacity` rather than a transparent colour, because a transparent
    input still draws its selection handles on Android.
  */
  input: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
    outlineWidth: 0,
    outlineStyle: "solid",
  },
}));
