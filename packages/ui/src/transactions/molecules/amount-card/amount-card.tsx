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
 * **The figure itself is `FigureInput`** — text drawn in a row with a
 * transparent input over it — which has the whole argument for why, and the
 * three ways the other arrangement failed on a device.
 *
 * **The currency is a chip when the caller can say what to do with a tap**
 * (S05 §3, §7.8): the input lies over the whole drawn row, so a button drawn
 * inside it would never be reached. The chip sits beside the figure instead,
 * at the card's right edge, and *replaces* the drawn affix — the currency is
 * said once. It is the one way an entry is switched to a foreign currency;
 * without a handler the card is exactly what it was.
 */

import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { CurrencyMark } from "../../../fx/currency-marks";
import {
  AMOUNT_INTEGER_DIGITS,
  exceedsAmountCeiling,
} from "../../../fx/molecules/amount-field/amount-field";
import { decimalMark } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { useInteraction } from "../../../primitives/interaction.ts";
import { CaretDownIcon } from "../../../shell/phosphor";
import { focusBorder } from "../../../theme/focus.ts";
import { text, textCap } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { sanitizeAmount } from "../../amount-keys.ts";
import { FigureInput } from "../figure-input/figure-input";

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
  /**
   * Drawn in the currency's place, on the figure's own line, while there is no
   * currency to draw — *Choose an account first*. It adds no line: the card is
   * as tall with it as without. It is drawn while the figure is empty and gives
   * way the moment a digit is typed, so it can never cost the figure width; it
   * is spoken with the field's label throughout.
   */
  waiting?: string | undefined;
  /** Which way the money goes, which is the figure's own colour on its sign. */
  kind: "expense" | "income";
  /** One finished sentence under the figure — *Groceries this month: 61% of usual*. */
  context?: string | undefined;
  /** `create_transaction`'s refusal of the amount, under the field it names. */
  error?: string | undefined;
  /** Opens the keyboard on mount — the amount is the first thing typed. */
  autoFocus?: boolean;
  /** Short window: the label is dropped (the input keeps it for assistive tech), the figure steps down to `displayOne` and the card is shorter. */
  compact?: boolean;
  /**
   * Makes the currency a chip that opens the currency choice (§7.8). Absent,
   * the currency is only drawn after the figure, as it always was.
   */
  onPressCurrency?: (() => void) | undefined;
  /** The chip's spoken name — *Currency of the amount: CZK. Change it.* */
  currencyLabel?: string | undefined;
  /**
   * The amount is in a currency other than the account's: the chip says so in
   * the accent, and not by colour alone — the charged line under the card is
   * the second signal.
   */
  foreign?: boolean;
};

export function AmountCard({
  label,
  raw,
  onChangeRaw,
  decimals,
  currency,
  waiting,
  kind,
  context,
  error,
  autoFocus = false,
  compact = false,
  onPressCurrency,
  currencyLabel,
  foreign = false,
}: AmountCardProps) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const mark = decimalMark(locale);
  const display = raw.replace(",", mark);
  // A figure past the ceiling is held, not cut (a pasted twelve digits must not
  // quietly become nine), and says why under the field; a refusal of the
  // write's own takes precedence.
  const shownError = error ?? (exceedsAmountCeiling(raw) ? t("common.amountCeiling") : undefined);
  const handleChange = useCallback(
    (typed: string) => onChangeRaw(sanitizeAmount(typed, decimals, mark)),
    [onChangeRaw, decimals, mark],
  );
  // The card is the field, so the card wears the ring (§2.6) — the input
  // inside it has its own suppressed, see `input` below.
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  const theme = useTheme();
  const sign = useMemo(
    () =>
      kind === "expense"
        ? ({ glyph: "−", color: theme.spend } as const)
        : ({ glyph: "+", color: theme.income } as const),
    [kind, theme],
  );

  // The chip is its own control with its own border: it shows focus in that border (§2.6).
  const { focused: chipFocused, handlers: chipHandlers } = useInteraction();
  const chip = currency !== undefined && onPressCurrency !== undefined;
  const figure = (
    <FigureInput
      // The drawn row is hidden from assistive technology, so the hint is spoken here.
      label={
        currency === undefined && waiting !== undefined
          ? t("common.fieldValue", { field: label, value: waiting })
          : label
      }
      value={display}
      onChangeText={handleChange}
      step={compact ? "displayOne" : "displayHero"}
      maxLength={AMOUNT_INTEGER_DIGITS + 1 + decimals}
      sign={sign}
      affix={
        chip ? undefined : currency === undefined ? (
          waiting === undefined || raw !== "" ? undefined : (
            <Text numberOfLines={1} style={styles.waiting}>
              {waiting}
            </Text>
          )
        ) : (
          <Text maxFontSizeMultiplier={textCap("displayHero")} style={styles.affix}>
            <CurrencyMark code={currency} />
          </Text>
        )
      }
      focused={focused}
      onFocus={handleFocus}
      onBlur={handleBlur}
      autoFocus={autoFocus}
    />
  );

  return (
    <View
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        focused ? (compact ? styles.focusedCompact : styles.focused) : null,
      ]}
    >
      {compact ? null : <Text style={styles.label}>{label}</Text>}
      {chip ? (
        <View style={styles.figureRow}>
          <View style={styles.figureFill}>{figure}</View>
          <PressableScaled
            accessibilityRole="button"
            accessibilityLabel={currencyLabel ?? currency}
            onPress={onPressCurrency}
            {...chipHandlers}
            style={[
              styles.chip,
              foreign ? styles.chipForeign : null,
              chipFocused ? styles.chipFocused : null,
            ]}
          >
            <Text maxFontSizeMultiplier={textCap("displayTwo")} style={styles.chipMark}>
              <CurrencyMark code={currency} />
            </Text>
            <CaretDownIcon size={14} color={theme.accentText} />
          </PressableScaled>
        </View>
      ) : (
        figure
      )}
      {shownError === undefined ? null : <Text style={styles.error}>{shownError}</Text>}
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
  cardCompact: { paddingVertical: space.lg },
  label: { color: theme.textMuted, ...text.ui("label") },
  focused: focusBorder(theme.focusRing, { horizontal: space.x3b, vertical: space.x5 }),
  focusedCompact: focusBorder(theme.focusRing, { horizontal: space.x3b, vertical: space.lg }),
  affix: { color: theme.accentText, ...text.ui("displayTwo") },
  figureRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  figureFill: { flex: 1, minWidth: 0 },
  // Sharp, never a pill (`waltning-design-taste`): the same 1pt outline and
  // `radius.sm` the other chips carry. The accent fill is the foreign state.
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: theme.borderInteractive,
    borderRadius: radius.sm,
  },
  chipForeign: { borderColor: theme.accent, backgroundColor: theme.accentFill },
  chipFocused: focusBorder(theme.focusRing, { horizontal: space.lg }),
  chipMark: { color: theme.accentText, ...text.ui("bodySm", 700) },
  // The hint gives way to the figure: it shrinks (and ellipsizes) a hundred
  // times faster than the digits, which are never cut for it.
  waiting: { color: theme.textMuted, ...text.ui("caption"), flexShrink: 100, minWidth: 0 },
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
