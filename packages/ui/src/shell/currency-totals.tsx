/**
 * `<CurrencyTotals>` — the shell's headline when there is no display currency.
 *
 * **The figure it replaces was wrong.** Today's hero summed every account
 * balance and labelled the result `USD`, which is only true of a ledger that
 * happens to hold nothing else — and the code that made that true was a throw
 * refusing any account that was not in dollars. Removing the refusal without
 * removing the sum would have turned a loud failure into a wrong number, which
 * is the worse of the two by a distance.
 *
 * **One line per currency, and no total.** Converting needs rates; `#e3` brings
 * them, and until then a combined figure would be H21 — a conversion invented at
 * the point of display, with no rate table for it to be wrong against.
 *
 * **The order is the ledger's, not the numbers'.** Ranking by magnitude would
 * put 12 400 above 840 regardless of which holding is larger, which is a
 * comparison across currencies printed as though the app could make one. The
 * first account's currency leads; the hero is a position, not a verdict.
 *
 * Distinct from `DualTotal`, which shows *mine* and *ours* in one currency
 * (§6.7) and answers a different question. When a display currency exists, that
 * is the component this slot gets back.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type CurrencySubtotal = {
  currency: string;
  decimals: number;
  balance: money.Money;
};

export type CurrencyTotalsProps = {
  /** In the ledger's order. Empty before the first account exists. */
  subtotals: readonly CurrencySubtotal[];
};

export function CurrencyTotals({ subtotals }: CurrencyTotalsProps) {
  const styles = useStyles();
  const [lead, ...rest] = subtotals;

  if (!lead) return null;

  return (
    <View style={styles.block}>
      <Amount
        value={lead.balance}
        currency={lead.currency}
        decimals={lead.decimals}
        size="hero"
        emphasis="shell"
      />
      {rest.map((subtotal) => (
        <Amount
          key={subtotal.currency}
          value={subtotal.balance}
          currency={subtotal.currency}
          decimals={subtotal.decimals}
          size="large"
          emphasis="shell"
        />
      ))}
      {rest.length === 0 ? null : (
        // Said, not implied. Two figures stacked read as a sum and a component
        // of it — the same shape `DualTotal` uses for exactly that — so the one
        // line that distinguishes them has to be on the screen.
        <Text style={styles.note}>Held separately — not a total.</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: space.md },
  note: { color: t.shellTextMuted, ...text.ui("caption") },
}));
