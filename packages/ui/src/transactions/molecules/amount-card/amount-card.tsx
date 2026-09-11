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
 */

import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { decimalMark } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { text, textCap } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import {
  DIGIT_EM,
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
  const figureWidth = {
    width: Math.max(1, display.length) * DIGIT_EM * typeScale.displayHero.fontSize,
  };
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <View style={[styles.card, focused ? styles.focused : null]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.figure}>
        {raw === "" ? null : (
          <Text
            maxFontSizeMultiplier={textCap("displayHero")}
            style={[styles.sign, kind === "expense" ? styles.signOut : styles.signIn]}
          >
            {kind === "expense" ? "−" : "+"}
          </Text>
        )}
        <TextInput
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
          style={[styles.input, figureWidth]}
        />
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
  signOut: { color: theme.spend },
  signIn: { color: theme.income },
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
