/**
 * `<RateField>` — `design-system/03` §3.7: "Editable FX rate, 4dp, shows the
 * synced value beside the override."
 *
 * **Read-only by default, editable on request.** S14 and S31 both derive their
 * rate from two typed amounts (§7.5, §7.6: *"two amounts are observable from a
 * statement, a rate is not"*) and hand this component the result to *display*
 * — `editable` stays `false` there. `04` §4.7's `RateEditor` sets it `true`
 * and gets a `TextInput` that accepts paste, because a rate copied off a bank
 * statement is the common case for that screen, not this one.
 *
 * **`manual` is the caller's claim, never a comparison this component makes.**
 * A derived rate almost never equals its reference — that gap is the ordinary
 * spread, not an assertion (P4) — so flagging "differs from reference" here
 * would paint every settlement and every transfer amber. Only the caller knows
 * whether a person typed *this* figure directly; `manual` mirrors `FxAmount`'s
 * own `provenance` prop for the same reason.
 *
 * **Editable holds its own text, seeded once from `value`.** `RateEditor`'s
 * own screen resets its committed rate to `""` the instant a keystroke fails
 * to parse (a typed `"0"`, mid-way to `"0.5"`) — the same rule
 * `AmountField`'s own `EditableAmountField` exists to protect against: if the
 * input mirrored that prop back on every render, the character the parent
 * rejected would visibly vanish before the next one could be typed. `value`
 * seeds the buffer; after that, this component owns what is on screen, and
 * `onChange` is the only way the parent hears about it.
 *
 * **The rate renders through `formatRate`** (`fx/format-rate.ts`) — the same
 * locale-aware path `RateTable` renders its own column through — rather than
 * a second `money.forDisplay` call kept here to drift from it.
 */

import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { formatRate } from "../fx/format-rate.ts";
import { useLocale, useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, tabularNums } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";
import { Tag } from "./tag";

export type RateFieldReference = {
  /**
   * A rate for display — `Money` (a derived figure), a branded `Rate`
   * (`fx_rates`' own direction), or a `CrossRate` (M1 — `readCrossRate`'s
   * own triangulated answer, the usual case here); `formatRate` renders any
   * of the three the same way, as a bare decimal.
   */
  rate: money.Money | money.Rate | money.CrossRate;
  source: string;
  /** `AccountingDate`'s shape — the reference row's own date, never today's. */
  date: string;
  /** H2 — `crossRateProvenance`'s own carry for the leg named by `source`/`date` above, together. `0`/absent renders the plain "· {{date}}" line; positive renders "· carried {{count}} d from {{date}}" so the carry is stated, not folded silently into a bare date. */
  carriedDays?: number;
  /** H1/H2 — true when either leg behind this reference was a person's own correction (`crossRateProvenance`), regardless of which leg's own date is shown. Renders as its own `Tag` beside the reference line, never in place of the displayed `source` — the shown leg's own, real source, unglued from a correction that may belong to the *other* leg. */
  manual?: boolean;
};

export type RateFieldProps = {
  /** Visible above the field and announced as its name. */
  label: string;
  /**
   * The rate to show — always rendered at `decimals` (4dp, §4.6). A derived
   * `Money`/`Rate` for the read-only path; a raw decimal `string` seeds the
   * editable path's own typed buffer (see above).
   */
  value: money.Money | money.Rate | string;
  decimals?: number;
  editable?: boolean;
  /** The typed rate, parsed by `parseRate` — `null` while what is typed is not a positive decimal. Required when `editable`; ignored otherwise. */
  onChange?: (value: string | null) => void;
  /** The synced value, shown beside the override (§3.7). */
  reference?: RateFieldReference;
  /** Amber — this figure is a person's own assertion, not a derived one (P4). */
  manual?: boolean;
  /** The caller's own refusal (a contract error, say) — always wins over the field's own, immediate objection to what is currently typed. */
  error?: string;
  /** The direction stated beside the label, e.g. `"PLN per USD"` (`04` §4.6/§4.7) — a rate has no unit of its own otherwise. */
  unit?: string;
};

/** How many digits follow the decimal mark in a stored decimal string — `0` for a whole number. */
function decimalPlaces(raw: string): number {
  const i = raw.indexOf(".");
  return i === -1 ? 0 : raw.length - i - 1;
}

/**
 * What was typed → a decimal string, or `null`. Accepts either separator, the
 * same rule `AmountField`'s own `parseAmount` states — a Polish keyboard
 * gives `,`, a numeric keypad often gives `.` — and rejects two of either,
 * because `4,023.1` is not a rate anyone meant to type. Unlike an amount, a
 * rate is never negative and never zero (`fx.ratePositive`'s own reasoning) —
 * `RUB per USD` at `0` states nothing, and a negative rate has no reading at
 * all.
 */
export function parseRate(input: string): string | null {
  const trimmed = input.replace(/\s| /g, "");
  if (trimmed === "") return null;

  const separators = (trimmed.match(/[.,]/g) ?? []).length;
  if (separators > 1) return null;

  const normalized = trimmed.replace(",", ".");
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  if (!/\d/.test(normalized)) return null;
  // M3 — "5," normalizes to "5.", the same mid-entry, "not yet a number"
  // shape `parseAmount` refuses for the same reason: `zMoney` requires a
  // digit after the mark once one is typed.
  if (normalized.endsWith(".")) return null;

  if (money.cmp(money.toMoney(normalized), money.ZERO) <= 0) return null;

  return normalized;
}

export function RateField({
  label,
  value,
  decimals = 4,
  editable = false,
  onChange,
  reference,
  manual = false,
  error,
  unit,
}: RateFieldProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const locale = useLocale();
  // Seeded once, from whatever `value` held at mount — see the docstring for
  // why this never re-syncs from `value` afterward. Through `formatRate`, so
  // a Polish reader opening an existing rate to edit sees `4,0231`, not the
  // storage form's `4.0231` echoed back unformatted.
  //
  // **At the value's own scale, never rounded down to `decimals` (L10).**
  // `decimals` is this field's *display* default (4dp, §4.6) — `fx_rates` is
  // stored to 8dp, and opening a synced rate to edit it, untouched, must not
  // silently downgrade its precision before a person has pressed a key. A
  // value with fewer than `decimals` digits still pads to `decimals`,
  // matching the read-only path exactly.
  const [text, setText] = useState(() => {
    if (!editable || value === "") return "";
    try {
      const raw = String(value);
      return formatRate(raw, locale, Math.max(decimals, decimalPlaces(raw)));
    } catch {
      // A caller can still seed a raw, unparsed string outside `parseRate`'s
      // own contract (a stale draft, say) — falls back to it unformatted
      // rather than crashing the mount over a value already headed for the
      // field's own inline refusal.
      return String(value);
    }
  });
  const [invalid, setInvalid] = useState(false);

  const handleChangeText = useCallback(
    (next: string) => {
      setText(next);
      const parsed = parseRate(next);
      setInvalid(next !== "" && parsed === null);
      onChange?.(parsed);
    },
    [onChange],
  );

  // The caller's own `error` always wins — this is only the field's own,
  // unprompted objection to what is currently typed.
  const message = error ?? (invalid ? t("fx.ratePositive") : undefined);
  const displayed = editable ? text : formatRate(value, locale, decimals);

  // H1/H2 — `{{source}}` is always the *shown* leg's own, real source;
  // `manual` never overwrites it, because that glued "manual" to whichever
  // leg's `date`/`carriedDays` happened to be displayed even when the
  // correction was on the *other* leg. `manual` renders as its own `Tag`
  // beside the line instead — an independent fact about the pair, not a
  // claim about which leg this line's date belongs to.
  const referenceText =
    reference === undefined
      ? undefined
      : reference.carriedDays !== undefined && reference.carriedDays > 0
        ? t("transactions.referenceRateCarried", {
            rate: formatRate(reference.rate, locale, decimals),
            source: reference.source,
            count: reference.carriedDays,
            date: reference.date,
          })
        : t("transactions.referenceRate", {
            rate: formatRate(reference.rate, locale, decimals),
            source: reference.source,
            date: reference.date,
          });

  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {unit === undefined ? null : <Text style={styles.unit}>{unit}</Text>}
        {!manual ? null : <Tag variant="warn">{t("transactions.manualRate")}</Tag>}
      </View>
      {editable ? (
        <TextInput
          accessibilityLabel={label}
          value={displayed}
          onChangeText={handleChangeText}
          keyboardType="decimal-pad"
          {...handlers}
          style={[styles.input, focused ? styles.focused : null, message ? styles.invalid : null]}
        />
      ) : (
        <Text style={styles.value}>{displayed}</Text>
      )}
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {referenceText === undefined ? null : !reference?.manual ? (
        <Text style={styles.reference}>{referenceText}</Text>
      ) : (
        <View style={styles.referenceRow}>
          <Text style={styles.reference}>{referenceText}</Text>
          <Tag variant="warn">{t("transactions.manualRate")}</Tag>
        </View>
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
  unit: { color: theme.textMuted, ...text.ui("caption") },
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
  referenceRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reference: {
    color: theme.textMuted,
    ...text.mono("caption"),
    fontVariant: [...tabularNums],
  },
}));
