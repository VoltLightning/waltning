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
 *
 * **A figure takes a `kind`, never a colour.** Money has three colours of its
 * own — income, spend, transfer — and this is the one place they are resolved,
 * so a screen cannot paint a credit in the action green or a debit in the
 * danger red. Both are near misses that look deliberate.
 */

import * as money from "@waltning/core/money";
import { Text, type TextStyle } from "react-native";
import { face } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { tabularNums, type } from "../tokens.ts";

export type AmountSize = "hero" | "large" | "body" | "small";
export type AmountEmphasis = "default" | "muted" | "shell";

/**
 * What kind of movement the figure is.
 *
 * `auto` is sign-based and is the default: a negative figure is spend, anything
 * else is plain ink. It is right for a balance, where a positive number is not
 * income — it is what you have. A row that *knows* it is income says so, and
 * gets the brighter green; a transfer says so and gets muted, because money
 * moved between your own accounts is neither gained nor lost.
 */
export type AmountKind = "auto" | "income" | "spend" | "transfer";

export type AmountProps = {
  /** A decimal string. A JS number holding money is a bug (`SPEC.md` §7.0). */
  value: money.Money;
  /** ISO code. Rendered as a trailing marker, never used to convert. */
  currency: string;
  /** Decimal places for this currency — 2 for most, 0 for JPY. */
  decimals?: number;
  size?: AmountSize;
  emphasis?: AmountEmphasis;
  kind?: AmountKind;
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
  kind = "auto",
  signed = false,
}: AmountProps) {
  // `cmp` rather than inspecting the string: `-0.00000000` is not a negative
  // balance, and `startsWith("-")` says it is — showing a cleared account in
  // the ink of an overdraft.
  const negative = money.cmp(value, money.toMoney("0")) < 0;
  const text = money.toMoney(value, decimals);
  const prefix = signed && !negative && !money.isZero(value) ? "+" : "";

  const styles = useStyles();

  // On the shell, emphasis wins: the hero total is one colour whatever its
  // sign, because the shell has its own ink and a red total on dark green is
  // neither legible nor what the screen is for.
  const tone =
    emphasis === "shell"
      ? styles.shell
      : kind === "income"
        ? styles.income
        : kind === "transfer"
          ? styles.transfer
          : kind === "spend" || negative
            ? styles.spend
            : null;

  return (
    <Text style={[styles.base, SIZES[size], tone, emphasis === "muted" ? styles.muted : null]}>
      {prefix}
      {text}
      <Text style={[styles.currency, emphasis === "shell" ? styles.shellCurrency : null]}>
        {" "}
        {currency}
      </Text>
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    color: t.text,
    // §2.2 files money under the **display** face. It is the same family as
    // the UI face now, and the reason the column still aligns on Android is
    // the file, not the feature below: IBM Plex Sans's digits are 600 units at
    // every weight with no feature applied. `fonts.test.ts` pins it.
    ...face.display(600),
    // Spread, not cast. React Native types `fontVariant` as a union of the
    // five real values, and both tokens are members — so this typechecks
    // *because they are correct*. `as string[]` compiled and would have
    // accepted a typo just as happily.
    fontVariant: [...tabularNums],
  },
  income: { color: t.income },
  spend: { color: t.spend },
  transfer: { color: t.textMuted },
  muted: { color: t.textMuted },
  shell: { color: t.shellText },
  currency: { color: t.textMuted, fontSize: type.caption.fontSize },
  shellCurrency: { color: t.shellTextMuted },
}));
