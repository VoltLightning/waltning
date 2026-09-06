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
  /**
   * Same "not yet known" rule as the field variant — see there. `|
   * undefined` (rather than plain `currency?: string`) so a story can state
   * "explicitly no currency" against `exactOptionalPropertyTypes` — a story
   * that omits the key instead has meta's own default leak through.
   */
  currency?: string | undefined;
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

  const commaNormalized = trimmed.replace(",", ".");
  if (!/^-?\d*\.?\d*$/.test(commaNormalized)) return null;
  if (!/\d/.test(commaNormalized)) return null;
  // M4 — a leading separator (",5" → ".5") is a real, complete number as
  // typed — the same way "5," is still mid-entry is not the same shape as
  // this one — but `.5` is not: `zMoney`'s regex requires a digit before the
  // mark once one is written at all (`^-?\d+(\.\d+)?$`), so this was
  // returned as a value and refused downstream instead of accepted here.
  // `"0" + "."` is the same number, in the shape the contract already takes.
  const normalized = commaNormalized.startsWith(".")
    ? `0${commaNormalized}`
    : commaNormalized.startsWith("-.")
      ? `-0${commaNormalized.slice(1)}`
      : commaNormalized;
  // M3/M1 — "5," normalizes to "5.", a shape `zMoney` refuses (its regex
  // requires a digit after the mark once one is typed). A trailing
  // separator is still mid-entry, the same "not yet a number" state as "."
  // alone, and belongs on the same side of the refusal.
  if (normalized.endsWith(".")) return null;
  // M1 — `zMoney`'s own refine (`dec(v).abs().lt("1000000000000")`): at most
  // twelve integer digits. Past that the schema would refuse the write
  // anyway; catching it here keeps Save disabled instead of enabled on a
  // figure the account never held.
  //
  // L — counted by *significance*, not by character: `zMoney`'s refine
  // compares the numeric value, so "0000000000001" (thirteen characters, one
  // significant digit) is nowhere near the cap it describes — a bare
  // `.length` would have refused it anyway, disabling Save on a figure the
  // schema was always going to accept.
  const integerPart = normalized.replace("-", "").split(".")[0] ?? "";
  const significantIntegerDigits = integerPart.replace(/^0+(?=\d)/, "").length;
  if (significantIntegerDigits > 12) return null;

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
      <View
        style={[
          styles.field,
          error ? styles.invalid : null,
          // §2.6: the ring goes on the field — `[input][affix]` — not the
          // `TextInput` alone, the same rule `search-field.tsx`'s fix states.
          // An errored field's ring is the danger colour instead of the
          // ordinary one.
          focused ? (error ? styles.focusedError : styles.focused) : null,
        ]}
      >
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
  /**
   * Sentence case, like every other field label in this system
   * (`primitives/text-field.tsx`'s own). `kicker` is already the eyebrow
   * step — 11 px, 700, letter-spaced — and upper-casing it on top made
   * *OPENING BALANCE* shout among the sentence-case labels beside it on the
   * same form. Casing is what a `Tag` does to mark a state; a field label
   * names a field.
   */
  label: {
    color: theme.textMuted,
    ...text.ui("kicker"),
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
    // Suppresses the browser's own native focus ring on this `TextInput` —
    // without it, focusing the field draws that ring here, on the actual
    // focused DOM node, bisecting the field instead of enclosing it. The
    // real ring is `focused`/`focusedError` above, on the wrapper. **Both
    // properties are required** — see `search-field.tsx`'s own fix: Chromium's
    // default `outline-style: auto` renders its own native ring at its own
    // width regardless of an author `outlineWidth: 0`.
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  affix: { color: theme.textMuted, ...text.ui("caption") },
  // **`outlineStyle` is required, not decorative** — see `search-field.tsx`'s
  // own fix: this `View` never receives real DOM focus, so without naming a
  // style `outline-style` stays at its CSS-initial `none` and neither ring
  // ever paints regardless of width or colour.
  focused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  focusedError: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.dangerBorder,
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
