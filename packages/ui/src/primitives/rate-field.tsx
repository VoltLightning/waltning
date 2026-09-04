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
import { Text, TextInput, View } from "react-native";
import { useT } from "../i18n/provider";
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
  const displayed = money.toMoney(value, decimals);

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
            rate: money.toMoney(reference.rate, decimals),
            source: reference.source,
            date: reference.date,
          })}
        </Text>
      )}
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
