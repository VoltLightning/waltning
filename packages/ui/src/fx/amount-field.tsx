/**
 * `<AmountField>` — `design-system/03` §3.7.
 *
 * Tabular numerals, **comma decimal**, currency affix, right-aligned.
 *
 * The comma is the whole reason this is its own component. The ledger is
 * Polish-first and `1.234,56` is how the amount is written there — while
 * `money.ts` works in decimal strings with a `.`, because that is what
 * `numeric(20,8)` takes. Somewhere the two have to meet, and if it is not here
 * it is in every screen that captures an amount.
 *
 * **It emits a decimal string or `null`, never a number.** A JS number holding
 * money is a bug (`SPEC.md` §7.0), and a field that returns `NaN` for "1,2,3"
 * pushes the decision about bad input onto whoever forgot to check.
 *
 * **`variant="hero"` is a second face on the same component, not a second
 * component.** S05 §3's `display-hero` amount is the same value this field
 * always held — a decimal string typed with a comma — read out at the largest
 * size on the screen instead of a `TextInput`. `Keypad` owns the editing on
 * that path (`amount-keys.ts#applyKey`); this only renders whatever raw string
 * the screen hands it, through the one `parseAmount` every caller already
 * shares. Two render paths, one parser — a second implementation here would be
 * the thing `parseAmount`'s own comment exists to prevent.
 */

import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { decimalMark } from "../i18n/locales.ts";
import { useLocale, useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, tabularNums } from "../tokens.ts";

export type AmountFieldFieldProps = {
  variant?: "field";
  label: string;
  /**
   * ISO code, shown as the affix. Never used to convert — that is `FxAmount`.
   *
   * **Optional, because "not yet known" is a real state.** Quick add asks for an
   * amount before an account, and until one is chosen there is no currency this
   * money is in. A placeholder affix there would label a figure in something it
   * is not, which is worse than an unlabelled field.
   */
  currency?: string;
  /** The decimal string, or `null` when what is typed is not yet an amount. */
  onChange: (value: string | null) => void;
  initial?: string;
  error?: string | undefined;
};

export type AmountFieldHeroProps = {
  variant: "hero";
  label: string;
  /** Same "not yet known" rule as the field variant — see there. */
  currency?: string;
  /**
   * The raw string a `Keypad` edits (`"48,90"`) — the canonical comma,
   * regardless of locale. Rendered through the locale's own decimal mark;
   * `parseAmount` is what turns this into the value `create_transaction`
   * takes, and it happens once, in the screen, not here.
   */
  value: string;
  /**
   * S31 §7 / S14 §7 — a screen with **two** hero amounts (a transfer's source
   * and destination, a settlement's amount and discharge) makes each tappable
   * so the keypad below can be routed to whichever one was touched. A screen
   * with one hero amount (Quick add) omits both and gets a plain, unpressable
   * figure — the same "absent means not applicable" `currency` already uses.
   */
  onPress?: () => void;
  /** Whether the keypad is currently routed here — drawn as a highlighted rule under the figure. */
  active?: boolean;
};

export type AmountFieldProps = AmountFieldFieldProps | AmountFieldHeroProps;

/**
 * What was typed → a decimal string, or `null`.
 *
 * Accepts either separator because both are typed in practice: a Polish
 * keyboard gives `,` and a numeric keypad often gives `.`. Rejects anything with
 * two, because `1,234.56` and `1.234,56` are the same characters and different
 * numbers, and guessing which one someone meant is how an amount gets multiplied
 * by a thousand.
 */
export function parseAmount(input: string): string | null {
  const trimmed = input.replace(/\s| /g, "");
  if (trimmed === "" || trimmed === "-") return null;

  const separators = (trimmed.match(/[.,]/g) ?? []).length;
  if (separators > 1) return null;

  const normalized = trimmed.replace(",", ".");
  if (!/^-?\d*\.?\d*$/.test(normalized)) return null;
  if (!/\d/.test(normalized)) return null;

  return normalized;
}

export function AmountField(props: AmountFieldProps) {
  if (props.variant === "hero") return <HeroAmountField {...props} />;
  return <EditableAmountField {...props} />;
}

function HeroAmountField({
  label,
  currency,
  value,
  onPress,
  active = false,
}: AmountFieldHeroProps) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const mark = decimalMark(locale);
  const display = value === "" ? "0" : value.replace(",", mark);
  const accessibilityLabel = t("common.fieldValue", { field: label, value: display });

  // Un-pressable: this `View` is the whole control, so it carries the label.
  // Pressable: the `Pressable` below is the control instead, and a second
  // `accessibilityLabel` here would have a screen reader announce "Amount:
  // 48.90" twice for the one tap target.
  if (onPress === undefined) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        style={[styles.heroField, active ? styles.heroFieldActive : null]}
      >
        <Text style={styles.heroValue}>{display}</Text>
        {currency === undefined ? null : <Text style={styles.heroAffix}>{currency}</Text>}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
    >
      <View style={[styles.heroField, active ? styles.heroFieldActive : null]}>
        <Text style={styles.heroValue}>{display}</Text>
        {currency === undefined ? null : <Text style={styles.heroAffix}>{currency}</Text>}
      </View>
    </Pressable>
  );
}

function EditableAmountField({
  label,
  currency,
  onChange,
  initial = "",
  error,
}: AmountFieldFieldProps) {
  const [text, setText] = useState(initial);
  const [focused, setFocused] = useState(false);

  const styles = useStyles();
  const handleTextChange = useCallback(
    (next: string) => {
      setText(next);
      onChange(parseAmount(next));
    },
    [onChange],
  );
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused ? styles.focused : null, error ? styles.invalid : null]}>
        <TextInput
          accessibilityLabel={label}
          // `decimal-pad` rather than `numeric`: it offers the separator and not
          // the operators, which is the only thing that can be typed here.
          keyboardType="decimal-pad"
          value={text}
          onChangeText={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={styles.input}
        />
        {currency === undefined ? null : <Text style={styles.affix}>{currency}</Text>}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  block: { gap: space.xs },
  label: {
    color: theme.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.x2,
    minHeight: 44,
  },
  input: {
    flex: 1,
    color: theme.text,
    ...text.display("displayThree"),
    // Right-aligned and tabular so a column of entered amounts lines up with
    // the column of rendered ones beside it.
    textAlign: "right",
    fontVariant: [...tabularNums],
  },
  affix: { color: theme.textMuted, ...text.ui("caption") },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  invalid: { borderColor: theme.dangerBorder },
  error: { color: theme.dangerText, ...text.ui("caption") },
  heroField: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: space.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  /** S31 §7 / S14 §7 — which of two hero amounts the keypad below edits. */
  heroFieldActive: { borderBottomColor: theme.accent },
  heroValue: {
    color: theme.text,
    ...text.display("displayHero"),
    fontVariant: [...tabularNums],
  },
  heroAffix: { color: theme.textMuted, ...text.ui("displayThree") },
}));
