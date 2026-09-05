/**
 * `<OtherCurrencies>` — the figures a widget's chart could not draw, listed
 * rather than dropped.
 *
 * A chart has one scale, and one scale means one currency: five PLN bars and a
 * CHF bar in the same axis would be a lie about magnitude. Arc-phone has no
 * rate table, so converting the rest into the lead currency is not available
 * either — and a converted figure would be invented, not merely approximate.
 *
 * What is left is the honest third option: the lead currency gets the chart,
 * and **every other currency gets its own row, unconverted, through
 * `<Amount>`**. Nothing on this dashboard disappears because it was not the
 * currency the header names. The alternative shipped once and was worse than
 * it looked: a single dormant foreign account could turn a month of forty
 * transactions into "Nothing spent this period."
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount, type AmountKind } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, space } from "../tokens.ts";

export type OtherCurrencyFigure = {
  value: money.Money;
  kind: AmountKind;
};

export type OtherCurrencyRow = {
  currency: string;
  decimals: number;
  /** One figure for a spend chart, two (income and expense) for a flow chart. */
  figures: readonly OtherCurrencyFigure[];
};

export type OtherCurrenciesProps = {
  rows: readonly OtherCurrencyRow[];
  /** "Other currencies" — the section's own heading, so the rows are not read as part of the chart. */
  label: string;
};

export function OtherCurrencies({ rows, label }: OtherCurrenciesProps) {
  const styles = useStyles();
  if (rows.length === 0) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      {rows.map((row) => (
        <View key={row.currency} style={styles.row}>
          <Text style={styles.currency}>{row.currency}</Text>
          <View style={styles.figures}>
            {row.figures.map((figure) => (
              <Amount
                key={figure.kind}
                value={figure.value}
                currency={row.currency}
                decimals={row.decimals}
                size="small"
                kind={figure.kind}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  block: {
    gap: space.xxs,
    paddingTop: space.sm,
    borderTopWidth: hairline.width,
    borderTopColor: theme.hairline,
  },
  label: { color: theme.textMuted, ...text.ui("caption") },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  currency: { color: theme.text, ...text.ui("caption", 600) },
  figures: { flexDirection: "row", alignItems: "center", gap: space.md },
}));
