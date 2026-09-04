/**
 * `<RateField>` — `design-system/03` §3.7: "Editable FX rate, 4dp, shows the
 * synced value beside the override."
 *
 * **Read-only by default, editable on request.** S14 and S31 both derive their
 * rate from two typed amounts (§7.5, §7.6: *"two amounts are observable from a
 * statement, a rate is not"*) and hand this component the result to *display*
 * — `editable` stays `false` there. A future caller that genuinely wants a
 * typed rate (`design-system/04` §4.7's `RateEditor`) sets it `true` and gets
 * a `TextInput` that accepts paste, because a rate copied off a bank statement
 * is the common case for that screen, not this one.
 *
 * **`manual` is the caller's claim, never a comparison this component makes.**
 * A derived rate almost never equals its reference — that gap is the ordinary
 * spread, not an assertion (P4) — so flagging "differs from reference" here
 * would paint every settlement and every transfer amber. Only the caller knows
 * whether a person typed *this* figure directly; `manual` mirrors `FxAmount`'s
 * own `provenance` prop for the same reason.
 */

import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { decimalMark } from "../i18n/locales.ts";
import { useLocale, useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, tabularNums } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";
import { Tag } from "./tag";

export type RateFieldReference = {
  /** A rate for display — `Money` (a derived figure) or a branded `Rate` (a reference read straight off `readCrossRate`); `money.toMoney` accepts either. */
  rate: money.Money | money.Rate;
  source: string;
  /** `AccountingDate`'s shape — the reference row's own date, never today's. */
  date: string;
};

export type RateFieldProps = {
  /** Visible above the field and announced as its name. */
  label: string;
  /** The rate to show — always rendered at `decimals` (4dp, §4.6). */
  value: money.Money | money.Rate;
  decimals?: number;
  editable?: boolean;
  /** Required when `editable`; ignored otherwise. */
  onChangeText?: (value: string) => void;
  /** The synced value, shown beside the override (§3.7). */
  reference?: RateFieldReference;
  /** Amber — this figure is a person's own assertion, not a derived one (P4). */
  manual?: boolean;
  error?: string;
};

/**
 * What was typed → a decimal string, or `null`. Accepts either separator, the
 * same rule `AmountField`'s own `parseAmount` states — a Polish keyboard
 * gives `,`, a numeric keypad often gives `.` — and rejects two of either,
 * because `4,023.1` is not a rate anyone meant to type.
 */
export function parseRate(input: string): string | null {
  const trimmed = input.replace(/\s| /g, "");
  if (trimmed === "") return null;

  const separators = (trimmed.match(/[.,]/g) ?? []).length;
  if (separators > 1) return null;

  const normalized = trimmed.replace(",", ".");
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  if (!/\d/.test(normalized)) return null;

  if (money.cmp(money.toMoney(normalized), money.ZERO) <= 0) return null;

  return normalized;
}

export function RateField({
  label,
  value,
  decimals = 4,
  editable = false,
  onChangeText,
  reference,
  manual = false,
  error,
}: RateFieldProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const mark = decimalMark(useLocale());
  // `money.forDisplay` — the same formatting `<Amount>` renders every figure
  // through (`fx/amount.tsx`) — takes a `Money`, and `value` here is also
  // legally a branded `Rate` (`PivotPerUnit` | `UnitsPerPivot`); `toMoney`
  // is the same normalization step this component always ran, just no
  // longer the last one.
  const displayed = money.forDisplay(money.toMoney(value, decimals), decimals, mark);
  const [focused, setFocused] = useState(false);
  // What was actually typed doesn't survive the round trip through a parent's
  // controlled `value` once it is rejected — `onChange(null)` typically resets
  // `value` back to `""`, which would erase the evidence a message needs to
  // point at. Held here, independent of `value`, so the message stays up
  // exactly as long as the reason for it does — cleared the moment a valid
  // positive rate is typed, not when `value` next changes for some other reason.
  const [invalid, setInvalid] = useState(false);

  const handleChangeText = useCallback(
    (next: string) => {
      const parsed = parseRate(next);
      setInvalid(next !== "" && parsed === null);
      onChange?.(parsed);
    },
    [onChange],
  );
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  // The caller's own `error` (a contract refusal, say) always wins — this is
  // only the field's own, immediate objection to what is currently typed.
  const message = error ?? (invalid ? t("fx.ratePositive") : undefined);

  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {!manual ? null : <Tag variant="warn">{t("transactions.manualRate")}</Tag>}
      </View>
      {editable ? (
        <TextInput
          accessibilityLabel={label}
          value={displayed}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          {...handlers}
          style={[styles.input, focused ? styles.focused : null, error ? styles.invalid : null]}
        />
      ) : (
        <Text style={styles.value}>{displayed}</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {reference === undefined ? null : (
        <Text style={styles.reference}>
          {t("transactions.referenceRate", {
            rate: money.forDisplay(money.toMoney(reference.rate, decimals), decimals, mark),
            source: reference.source,
            date: reference.date,
          })}
        </Text>
      )}
        <View
          style={[styles.field, focused ? styles.focused : null, message ? styles.invalid : null]}
        >
          <TextInput
            accessibilityLabel={label}
            keyboardType="decimal-pad"
            value={value}
            onChangeText={handleChangeText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            editable={!disabled}
            style={styles.input}
          />
        </View>
      )}
      {syncedValue === undefined ? null : (
        <Text style={styles.synced}>{t("fx.rateFieldSynced", { rate: syncedValue })}</Text>
      )}
      {message ? <Text style={styles.error}>{message}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  block: { gap: space.xs },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: {
    color: theme.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  value: {
    color: theme.text,
    ...text.display("displayThree"),
    fontVariant: [...tabularNums],
  },
  input: {
    color: theme.text,
    ...text.display("displayThree"),
    fontVariant: [...tabularNums],
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.x2,
    minHeight: 44,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  invalid: { borderColor: theme.dangerBorder },
  error: { color: theme.dangerText, ...text.ui("caption") },
  reference: {
    color: theme.textMuted,
    ...text.mono("caption"),
    fontVariant: [...tabularNums],
  },
}));
