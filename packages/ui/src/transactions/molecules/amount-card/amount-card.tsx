/**
 * `<AmountCard>` — S05 §3's *How much?*: the one field that is always
 * required and always typed, in its own card, at `displayHero`.
 *
 * **A `TextInput`, not a keypad.** The deck draws no keypad under the amount;
 * the system's own decimal keyboard is the one every other number on the phone
 * is typed on, and it leaves the screen to the draft. What the keyboard hands
 * back is folded through `sanitizeAmount` so the draft only ever holds what
 * `parseAmount` can read — digits, one comma, the account's own fraction
 * digits — and the caret never lands past a character that was refused.
 *
 * **The sign is drawn, never typed.** §7.2 stores every amount positive with
 * `type` carrying direction, so the `−` in front of an expense and the `+` in
 * front of income are the *kind's* colour on the figure, not part of the
 * value. A composer that let the keypad mean a sign is how sign-flip bugs
 * return (S05 §9.1).
 *
 * **Every figure through `<Amount>`** does not apply to a field being typed
 * into — a half-typed `"48,"` is not a figure yet — which is why the affix and
 * the sign are drawn here, and why `context` arrives as a finished sentence
 * rather than a number this component would have to format.
 *
 * **Nothing in this row may move while a digit is typed.** Two things did, and
 * both read as the figure lurching under the thumb:
 *
 * 1. The sign was mounted on the first keystroke, so every character after the
 *    first sat one glyph and one gap to the right of where the first one
 *    landed. It is always mounted now and merely *invisible* while the field
 *    is empty, so it holds its place from the start.
 * 2. The width reserved for the field was **estimated** from per-character em
 *    constants, and an estimate can only be right on the platform it was
 *    measured on. Two numbers were wrong in turn — every character as a digit,
 *    then a guessed `0.21` against a real `0.299` — and each correction was
 *    still a guess about a font at a size on a renderer. The field measures
 *    itself now: an invisible `Text` holding the same value sizes the row with
 *    its own glyphs, and the input lies over it. No constant decides a width,
 *    so no constant can be wrong about one.
 */

import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { decimalMark } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { SheetAwareTextInput } from "../../../primitives/sheet-input";
import { text, textCap } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import {
  CARET_EM,
  focus,
  radius,
  space,
  tabularNums,
  touchTarget,
  type as typeScale,
} from "../../../tokens.ts";
import { AMOUNT_INTEGER_DIGITS, sanitizeAmount } from "../../amount-keys.ts";

export type AmountCardProps = {
  /** The card's own label — *How much?* */
  label: string;
  /** The raw string the draft holds — `"48,90"`, `""` at rest. */
  raw: string;
  onChangeRaw: (raw: string) => void;
  /** The account's fraction digits — `sanitizeAmount`'s cap. */
  decimals: number;
  /** Drawn after the figure, in the accent — absent until an account is chosen. */
  currency?: string | undefined;
  /** Which way the money goes, which is the figure's own colour on its sign. */
  kind: "expense" | "income";
  /** One finished sentence under the figure — *Groceries this month: 61% of usual*. */
  context?: string | undefined;
  /** `create_transaction`'s refusal of the amount, under the field it names. */
  error?: string | undefined;
  /** Opens the keyboard on mount — the amount is the first thing typed. */
  autoFocus?: boolean;
};

export function AmountCard({
  label,
  raw,
  onChangeRaw,
  decimals,
  currency,
  kind,
  context,
  error,
  autoFocus = false,
}: AmountCardProps) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const mark = decimalMark(locale);
  const display = raw.replace(",", mark);
  const handleChange = useCallback(
    (typed: string) => onChangeRaw(sanitizeAmount(typed, decimals, mark)),
    [onChangeRaw, decimals, mark],
  );
  // The card is the field, so the card wears the ring (§2.6) — the input
  // inside it has its own suppressed, see `input` below.
  const [focused, setFocused] = useState(false);
  // Sized to the figure, so the affix follows it: an `<input>` otherwise
  // takes its own default width and the currency lands at the far edge.

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <View style={[styles.card, focused ? styles.focused : null]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.figure}>
        {/*
          Always mounted, invisible until there is a figure to sign: a sign
          that appears on the first keystroke pushes every later digit sideways.
          `opacity` rather than a conditional, so the row's geometry is the same
          empty and full.
        */}
        <Text
          // All three: the native pair and the web one. `react-native-web`
          // maps neither native prop (`conformance.test.ts`).
          accessibilityElementsHidden={raw === ""}
          importantForAccessibility={raw === "" ? "no-hide-descendants" : "auto"}
          aria-hidden={raw === "" ? true : undefined}
          maxFontSizeMultiplier={textCap("displayHero")}
          style={[
            styles.sign,
            kind === "expense" ? styles.signOut : styles.signIn,
            raw === "" ? styles.signEmpty : null,
          ]}
        >
          {kind === "expense" ? "−" : "+"}
        </Text>
        {/*
          **The measure, and the reason there is no arithmetic here.** This
          `Text` carries the same string in the same style, so the row is
          exactly as wide as the glyphs actually drawn — on any platform, in
          any font, at any accessibility scale. The input is laid over it.

          `"0"` when empty, because that is the placeholder the field shows:
          without it the box would be narrower than what is on screen and the
          first keystroke would move the affix.

          Hidden from assistive tech in all three dialects — the input beside
          it carries the accessible name, and a screen reader that read both
          would say the amount twice.
        */}
        <View style={styles.figureBox}>
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            maxFontSizeMultiplier={textCap("displayHero")}
            numberOfLines={1}
            style={[styles.input, styles.measure]}
          >
            {display === "" ? "0" : display}
          </Text>
          <SheetAwareTextInput
            accessibilityLabel={label}
            value={display}
            onChangeText={handleChange}
            placeholder="0"
            placeholderTextColor={styles.placeholder.color}
            keyboardType="decimal-pad"
            inputMode="decimal"
            // `parseAmount`'s twelve integer digits, the mark and the fraction —
            // past that the schema would refuse the write anyway.
            maxLength={AMOUNT_INTEGER_DIGITS + 1 + decimals}
            autoFocus={autoFocus}
            onFocus={handleFocus}
            onBlur={handleBlur}
            maxFontSizeMultiplier={textCap("displayHero")}
            style={[styles.input, styles.overlay]}
          />
        </View>
        {currency === undefined ? null : <Text style={styles.affix}>{currency}</Text>}
      </View>
      {error === undefined ? null : <Text style={styles.error}>{error}</Text>}
      {context === undefined ? null : (
        <View style={styles.contextRow}>
          <Text
            style={styles.context}
            accessibilityLabel={t("common.fieldValue", { field: label, value: context })}
          >
            {context}
          </Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  // The deck's amount card: 22 above and below, 18 at the sides — taller than
  // an ordinary card because the figure is the screen.
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    paddingVertical: space.x5,
    paddingHorizontal: space.x3b,
    gap: space.md,
  },
  label: { color: theme.textMuted, ...text.ui("label") },
  figure: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.md,
    // §10's floor on the one row that is pressed — the input is the whole line.
    minHeight: touchTarget.min,
  },
  focused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  sign: { ...text.display("displayHero") },
  /** Holds its width, shows nothing — see the header. */
  signEmpty: { opacity: 0 },
  signOut: { color: theme.spend },
  signIn: { color: theme.income },
  /**
   * The row's own width comes from the `Text` inside it; see the header.
   *
   * **The one thing measuring cannot give is room for the caret**, because the
   * caret is not a glyph — it is drawn after the last one, and a box that is
   * exactly its text leaves it flush against the currency marker. `CARET_EM`
   * survives for that alone: an affordance expressed as a fraction of the type
   * scale, never a claim about what a character is wide.
   */
  figureBox: { flexShrink: 1, paddingRight: CARET_EM * typeScale.displayHero.fontSize },
  /**
   * Laid out, never seen. `opacity: 0` rather than `display: none` or a zero
   * height — the whole point is that it occupies exactly the space its glyphs
   * need, which nothing that is not laid out can do.
   */
  measure: { opacity: 0 },
  /**
   * Over the measure, exactly. `absoluteFill` rather than a second copy of the
   * geometry: two boxes that must agree are one box that can disagree.
   */
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  input: {
    flexShrink: 1,
    padding: 0,
    color: theme.text,
    ...text.display("displayHero"),
    fontVariant: [...tabularNums],
    // The card is the field; the browser's own ring on the input inside it
    // would draw a second box around the figure. `outlineStyle` too, because
    // the default `auto` renders its own ring at its own width regardless of
    // an author `outlineWidth: 0` (`amount-field.tsx`'s own note).
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  // `textMuted`, never `textFaint`: a placeholder is read (`tests/architecture.test.ts`'s faint-ink rule).
  placeholder: { color: theme.textMuted },
  affix: { color: theme.accentText, ...text.ui("displayTwo") },
  contextRow: { flexDirection: "row", marginTop: space.xs },
  context: {
    color: theme.accentText,
    backgroundColor: theme.accentFill,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.lg,
    ...text.ui("caption", 500),
  },
  error: { color: theme.dangerText, ...text.ui("caption") },
}));
