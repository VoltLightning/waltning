/**
 * `<Amount>` — `design-system/04` §4.1.
 *
 * One figure, in one currency, never converted. Conversion is `<FxAmount>`, and
 * the split is the whole of P1: a component that *could* convert would
 * sometimes be handed an amount and a rate from different dates, and nothing in
 * its signature would object.
 *
 * **Every amount is tabular.** §2.2 calls it mandatory and names it the most
 * common omission when figures are rendered ad hoc — without it a column of
 * numbers does not align, and a ledger that does not align is read wrong.
 */

import { money } from "@waltning/core";
import { Text, type TextStyle } from "react-native";
import { makeStyles } from "../theme/index.ts";
import { fontFamily, tabularNums, type } from "../tokens.ts";

export type AmountSize = "hero" | "large" | "body" | "small";
export type AmountEmphasis = "default" | "muted";

export type AmountProps = {
  /** A decimal string. A JS number holding money is a bug (`SPEC.md` §7.0). */
  value: money.Money;
  /** ISO code. Rendered as a trailing marker, never used to convert. */
  currency: string;
  /** Decimal places for this currency — 2 for most, 0 for JPY. */
  decimals?: number;
  size?: AmountSize;
  emphasis?: AmountEmphasis;
  /** Force a leading `+` on positives. Off by default; ledgers rarely want it. */
  signed?: boolean;
};

const SIZES: Record<AmountSize, TextStyle> = {
  hero: type.displayHero,
  large: type.displayTwo,
  body: type.body,
  small: type.bodySm,
};

export function Amount({
  value,
  currency,
  decimals = 2,
  size = "body",
  emphasis = "default",
  signed = false,
}: AmountProps) {
  // `cmp` rather than inspecting the string: `-0.00000000` is not a negative
  // balance, and `startsWith("-")` says it is — showing a cleared account in
  // the ink of an overdraft.
  const negative = money.cmp(value, "0") < 0;
  const text = money.toMoney(value, decimals);
  const prefix = signed && !negative && !money.isZero(value) ? "+" : "";

  const styles = useStyles();

  return (
    <Text
      style={[
        styles.base,
        SIZES[size],
        size === "hero" || size === "large" ? styles.display : null,
        negative ? styles.negative : null,
        emphasis === "muted" ? styles.muted : null,
      ]}
    >
      {prefix}
      {text}
      <Text style={styles.currency}> {currency}</Text>
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    color: t.text,
    fontFamily: fontFamily.ui,
    // Spread, not cast. React Native types `fontVariant` as a union of the
    // five real values, and both tokens are members — so this typechecks
    // *because they are correct*. `as string[]` compiled and would have
    // accepted a typo just as happily.
    fontVariant: [...tabularNums],
  },
  /** The serif is for figures and headings — it makes a total feel weighed. */
  display: { fontFamily: fontFamily.display, fontWeight: "600" },
  negative: { color: t.dangerText },
  muted: { color: t.textMuted },
  currency: { color: t.textMuted, fontSize: type.caption.fontSize },
}));
