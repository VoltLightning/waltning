/**
 * `<IncomeVsExpenseWidget>` — `S01` §3/§4's `income_vs_expense` chart:
 * "hue **plus** marker shape and end labels" (§7.1) for the two series.
 *
 * **Paired bars, not `LineChart`'s two lines.** The same tokens argument
 * `spend-by-category-widget.tsx` makes: no chart library is in this slice's
 * dependency budget, and §7.1's actual requirement — the two series
 * distinguishable by more than hue, each bucket's own figures readable
 * directly — holds for a bar pair labelled with `<Amount kind="income">` /
 * `<Amount kind="spend">` exactly as it would for two marker shapes on a
 * line. `theme.income`/`theme.spend` are this app's two fixed money colours,
 * so the hue itself already carries the same meaning `StatTile` and every
 * transaction row give it.
 */

import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { WidgetCard } from "./widget-card";

export type IncomeVsExpenseBar = {
  label: string;
  income: money.Money;
  expense: money.Money;
  currency: string;
  decimals: number;
};

export type IncomeVsExpenseWidgetProps = {
  title: string;
  meta: string;
  bars: readonly IncomeVsExpenseBar[];
  incomeLabel: string;
  expenseLabel: string;
  emptyLabel: string;
  loading?: boolean | undefined;
  error?: string | undefined;
};

export function IncomeVsExpenseWidget({
  title,
  meta,
  bars,
  incomeLabel,
  expenseLabel,
  emptyLabel,
  loading,
  error,
}: IncomeVsExpenseWidgetProps) {
  const styles = useStyles();
  // The taller bar sets the scale both series share — an income bucket and an
  // expense bucket drawn against two different maxima would be two charts
  // wearing one axis.
  const max = bars
    .flatMap((bar) => [money.dec(bar.income), money.dec(bar.expense)])
    .reduce((tallest, value) => (value.greaterThan(tallest) ? value : tallest), money.dec(0));

  return (
    <WidgetCard title={title} meta={meta} loading={loading} error={error}>
      {bars.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <View style={styles.chart}>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.incomeSwatch]} />
              <Text style={styles.legendLabel}>{incomeLabel}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.expenseSwatch]} />
              <Text style={styles.legendLabel}>{expenseLabel}</Text>
            </View>
          </View>
          {bars.map((bar) => {
            const incomeShare = Math.max(
              max.isZero() ? 0 : money.dec(bar.income).dividedBy(max).toNumber(),
              0.02,
            );
            const expenseShare = Math.max(
              max.isZero() ? 0 : money.dec(bar.expense).dividedBy(max).toNumber(),
              0.02,
            );
            const incomeFillGrow = { flexGrow: incomeShare };
            const incomeTrackGrow = { flexGrow: 1 - incomeShare };
            const expenseFillGrow = { flexGrow: expenseShare };
            const expenseTrackGrow = { flexGrow: 1 - expenseShare };
            return (
              <View key={bar.label} style={styles.bucket}>
                <Text style={styles.bucketLabel}>{bar.label}</Text>
                <View style={styles.pair}>
                  <View style={styles.track}>
                    <View style={[styles.fill, styles.incomeFill, incomeFillGrow]} />
                    <View style={incomeTrackGrow} />
                  </View>
                  <Amount
                    value={bar.income}
                    currency={bar.currency}
                    decimals={bar.decimals}
                    size="small"
                    kind="income"
                  />
                </View>
                <View style={styles.pair}>
                  <View style={styles.track}>
                    <View style={[styles.fill, styles.expenseFill, expenseFillGrow]} />
                    <View style={expenseTrackGrow} />
                  </View>
                  <Amount
                    value={bar.expense}
                    currency={bar.currency}
                    decimals={bar.decimals}
                    size="small"
                    kind="spend"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </WidgetCard>
  );
}

const useStyles = makeStyles((theme) => ({
  chart: { gap: space.md },
  legend: { flexDirection: "row", gap: space.lg },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: space.lg, height: space.lg, borderRadius: radius.xs },
  incomeSwatch: { backgroundColor: theme.income },
  expenseSwatch: { backgroundColor: theme.spend },
  legendLabel: { color: theme.textMuted, ...text.ui("caption") },
  bucket: { gap: space.xxs },
  bucketLabel: { color: theme.text, ...text.ui("caption", 600) },
  pair: { flexDirection: "row", alignItems: "center", gap: space.sm },
  track: {
    flex: 1,
    flexDirection: "row",
    height: space.lg,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  fill: { minWidth: space.xs },
  incomeFill: { backgroundColor: theme.income },
  expenseFill: { backgroundColor: theme.spend },
  empty: { color: theme.textMuted, ...text.ui("body") },
}));
