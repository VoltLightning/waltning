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
 */

import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, tabularNums } from "../tokens.ts";

export type AmountFieldProps = {
  label: string;
  /** ISO code, shown as the affix. Never used to convert — that is `FxAmount`. */
  currency: string;
  /** The decimal string, or `null` when what is typed is not yet an amount. */
  onChange: (value: string | null) => void;
  initial?: string;
  error?: string | undefined;
};

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
  const trimmed = input.replace(/\s| /g, "");
  if (trimmed === "" || trimmed === "-") return null;

  const separators = (trimmed.match(/[.,]/g) ?? []).length;
  if (separators > 1) return null;

  const normalized = trimmed.replace(",", ".");
  if (!/^-?\d*\.?\d*$/.test(normalized)) return null;
  if (!/\d/.test(normalized)) return null;

  return normalized;
}

export function AmountField({ label, currency, onChange, initial = "", error }: AmountFieldProps) {
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
        <Text style={styles.affix}>{currency}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: space.xs },
  label: {
    color: t.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.xl,
    minHeight: 44,
  },
  input: {
    flex: 1,
    color: t.text,
    ...text.display("displayThree"),
    // Right-aligned and tabular so a column of entered amounts lines up with
    // the column of rendered ones beside it.
    textAlign: "right",
    fontVariant: [...tabularNums],
  },
  affix: { color: t.textMuted, ...text.ui("caption") },
  focused: { outlineWidth: focus.width, outlineColor: t.focusRing, outlineOffset: focus.offset },
  invalid: { borderColor: t.dangerBorder },
  error: { color: t.dangerText, ...text.ui("caption") },
}));
