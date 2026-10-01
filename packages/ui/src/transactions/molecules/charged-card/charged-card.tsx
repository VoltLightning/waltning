/**
 * `<ChargedCard>` — S05 §3's second figure, drawn only when the amount above
 * is in a currency other than the account's (§7.8): *Charged to Bank A · EUR*,
 * and the figure the account was actually charged.
 *
 * **Pre-filled, never silent.** The screen fills it at the entry day's cross
 * rate and says so under the figure (*1 CZK = 0,0401 € on this day*) — or says
 * there is no rate and leaves it empty. A person who has the bank statement
 * types over it, and from then on it is theirs: the pre-fill stops following
 * the amount (the screen's rule, the same one S31's destination keeps). It is
 * the figure every balance and period figure reads, so it is required.
 *
 * **The same field as the amount.** `FigureInput` at a smaller step, in the
 * same card shape, so the two read as one pair; the currency is drawn after the
 * figure, in the account's own mark, and there is no chip because this
 * currency is not a choice — it is the account's.
 */

import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { CurrencyMark } from "../../../fx/currency-marks";
import {
  AMOUNT_INTEGER_DIGITS,
  exceedsAmountCeiling,
} from "../../../fx/molecules/amount-field/amount-field";
import { decimalMark } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { focusBorder } from "../../../theme/focus.ts";
import { text, textCap } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { sanitizeAmount } from "../../amount-keys.ts";
import { FigureInput } from "../figure-input/figure-input";

export type ChargedCardProps = {
  /** *Charged to Bank A · EUR* — the card's own label. */
  label: string;
  /** The raw string the draft holds — `"14,02"`, `""` while there is no rate. */
  raw: string;
  onChangeRaw: (raw: string) => void;
  /** The account's own currency, and its fraction digits. */
  currency: string;
  decimals: number;
  /** One finished sentence under the figure — the rate it was filled at, or that there is none. */
  hint?: string | undefined;
  /** The refusal of this figure, under the field it names. */
  error?: string | undefined;
};

export function ChargedCard({
  label,
  raw,
  onChangeRaw,
  currency,
  decimals,
  hint,
  error,
}: ChargedCardProps) {
  const t = useT();
  const styles = useStyles();
  const mark = decimalMark(useLocale());
  const display = raw.replace(",", mark);
  const shownError = error ?? (exceedsAmountCeiling(raw) ? t("common.amountCeiling") : undefined);
  const handleChange = useCallback(
    (typed: string) => onChangeRaw(sanitizeAmount(typed, decimals, mark)),
    [onChangeRaw, decimals, mark],
  );
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <View style={[styles.card, focused ? styles.focused : null]}>
      <Text style={styles.label}>{label}</Text>
      <FigureInput
        label={label}
        value={display}
        onChangeText={handleChange}
        step="displayTwo"
        maxLength={AMOUNT_INTEGER_DIGITS + 1 + decimals}
        affix={
          <Text maxFontSizeMultiplier={textCap("displayTwo")} style={styles.affix}>
            <CurrencyMark code={currency} />
          </Text>
        }
        focused={focused}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {shownError === undefined ? null : <Text style={styles.error}>{shownError}</Text>}
      {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.x3b,
    gap: space.sm,
  },
  focused: focusBorder(theme.focusRing, { horizontal: space.x3b, vertical: space.lg }),
  label: { color: theme.textMuted, ...text.ui("label") },
  affix: { color: theme.accentText, ...text.ui("displayTwo") },
  // `textMuted`, never `textFaint`: the rate is read.
  hint: { color: theme.textMuted, ...text.ui("caption") },
  error: { color: theme.dangerText, ...text.ui("caption") },
}));
