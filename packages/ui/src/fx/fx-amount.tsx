/**
 * `<FxAmount>` — the P1 component. `design-system/04` §4.2.
 *
 * ```
 *   62,40 $ · 4,0231 · 251,04 zł
 *   └ local    └ rate   └ main
 * ```
 *
 * **It cannot be rendered without a rate.** The spec calls that "what makes P1
 * a guarantee rather than a convention", so it is enforced by the *type* rather
 * than by a comment: `rate` is required, and `provenance` is a discriminated
 * union in which every non-`synced` variant carries the extra field its marker
 * needs. Omitting the rate is a compile error, and `fx-amount.type-test.ts`
 * asserts that with `@ts-expect-error` — a rule that only fails at run time
 * fails after the wrong number is already on screen.
 *
 * The rate is for **the row's own date**, never today's. A converted figure
 * that silently used today's rate is the defect P1 exists to prevent: it is
 * wrong by exactly the market's movement, and it looks entirely reasonable.
 *
 * All three non-synced variants are amber under one meaning — *asserted or aged
 * rather than observed* (P4). They differ in **text**, which is what makes them
 * distinguishable to someone who cannot tell the two ambers apart (P5).
 */

import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space, tabularNums } from "../tokens.ts";
import { Amount } from "./amount";

/**
 * Where the rate came from, and what the row therefore has to say about it.
 *
 * A union rather than a string plus optional fields: `stale` without an age and
 * `override` with one are both nonsense, and a flat shape permits them.
 */
export type FxProvenance =
  | { kind: "synced" }
  /** A person asserted this rate. Travels with the row everywhere it appears. */
  | { kind: "override" }
  /** The row's date had no published rate, so the nearest was used (§7.6). */
  | { kind: "estimated" }
  /** Aged. The age is required — "stale" without it is not actionable. */
  | { kind: "stale"; ageDays: number };

export type FxAmountProps = {
  /** The amount as captured, in the account's own currency. */
  value: money.Money;
  currency: string;
  /**
   * The rate **for this row's date**, as a decimal string. Required: there is
   * no rendering of this component that does not show its rate.
   */
  /**
   * **`PivotPerUnit`, not `Money`.** The conversion below multiplies by it, so
   * it must be the pivot-per-unit direction — and `computations.md` §4 records
   * that the other direction is called *rate* too, and that confusing them
   * produced a 14.1× error. It was `Money`, which made the rate and the amount
   * the same type: `toPivot(rate, value)` compiled.
   */
  rate: money.PivotPerUnit;
  /** The currency the converted figure is expressed in. */
  displayCurrency: string;
  decimals?: number;
  displayDecimals?: number;
  /** Rate precision. 4dp throughout the design system (§4.6). */
  rateDecimals?: number;
  provenance?: FxProvenance;
};

const MARKER: Record<Exclude<FxProvenance["kind"], "synced">, string> = {
  override: "manual",
  estimated: "estimated",
  stale: "stale",
};

export function FxAmount({
  value,
  currency,
  rate,
  displayCurrency,
  decimals = 2,
  displayDecimals = 2,
  rateDecimals = 4,
  provenance = { kind: "synced" },
}: FxAmountProps) {
  // Converted here rather than by the caller, and this is the point of the
  // component: the figure and the rate that produced it cannot come from
  // different places, because there is only one place.
  const converted = money.toPivot(value, rate);

  const styles = useStyles();

  return (
    <View style={styles.row}>
      <Amount value={value} currency={currency} decimals={decimals} size="small" emphasis="muted" />
      <Text style={styles.separator}>·</Text>
      <Text style={styles.rate}>{money.toMoney(rate, rateDecimals)}</Text>
      <Text style={styles.separator}>·</Text>
      <Amount value={converted} currency={displayCurrency} decimals={displayDecimals} />
      {provenance.kind === "synced" ? null : (
        <Tag variant="warn">
          {provenance.kind === "stale"
            ? // The age, not just the word. "Stale" alone tells you something is
              // wrong and nothing about whether it matters.
              `${MARKER.stale} ${provenance.ageDays}d`
            : MARKER[provenance.kind]}
        </Tag>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  separator: { color: theme.textMuted, ...text.ui("caption") },
  rate: {
    color: theme.textMuted,
    ...text.mono("caption"),
    fontVariant: [...tabularNums],
  },
}));
