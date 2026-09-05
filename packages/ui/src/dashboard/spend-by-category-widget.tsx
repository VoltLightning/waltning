/**
 * `<SpendByCategoryWidget>` — `S01` §3/§4's category chart: "5 segments +
 * *other*, each directly labelled" (§7.2), at **leaf** granularity.
 *
 * **A labelled stacked bar, not `DonutChart`'s arc.** `theme.chartRamp`'s own
 * doc — "the green ramp is the entire chart palette: magnitude reads as
 * depth" — says color already carries no second hue to lean on, and neither
 * RN nor RNW draws a conic gradient without a new dependency this slice does
 * not need: a bar is the same ramp, the same direct labels, and the same
 * "each segment names itself" property (§7.2's actual requirement), at the
 * cost of a ring shape a follow-up can still add without touching the data
 * this widget already gets right.
 *
 * **Top five, the sixth-and-on folded into *other*.** The caller (the
 * screen) sorts by amount and does the folding — this widget only draws
 * whatever `segments` it is handed, the same "no arrangement of its own"
 * property `DashboardGrid` has.
 *
 * **A non-positive segment takes no width, and no share of the total.** A
 * transaction's lines need only *sum* to its amount — `transaction_lines` has
 * no positivity CHECK — so a legal four-line split carrying a discount line
 * produces a negative bucket. Renormalising every other segment against a
 * total that includes it would silently inflate all of them; the figure is
 * still stated in the legend, where it is a fact rather than a proportion.
 */

import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { OtherCurrencies, type OtherCurrencyRow } from "./other-currencies";
import { WidgetCard, type WidgetFrame } from "./widget-card";

export type SpendByCategorySegment = {
  key: string;
  label: string;
  amount: money.Money;
  currency: string;
  decimals: number;
};

export type SpendByCategoryWidgetProps = WidgetFrame & {
  title: string;
  /** The lead currency's own categories, already ranked and folded by the screen. */
  segments: readonly SpendByCategorySegment[];
  /** Every other currency's total for the same period — unconverted, never charted. */
  others: readonly OtherCurrencyRow[];
  othersLabel: string;
  emptyLabel: string;
  loading?: boolean | undefined;
  error?: string | undefined;
};

export function SpendByCategoryWidget({
  title,
  currency,
  period,
  scope,
  segments,
  others,
  othersLabel,
  emptyLabel,
  loading,
  error,
}: SpendByCategoryWidgetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const ramp = theme.chartRamp;
  // Positive amounts only — see the file doc. A negative segment is a fact in
  // the legend and nothing in the bar.
  const total = segments.reduce(
    (sum, s) => (money.isPositive(s.amount) ? sum.plus(money.dec(s.amount)) : sum),
    money.dec(0),
  );

  return (
    <WidgetCard
      title={title}
      currency={currency}
      period={period}
      scope={scope}
      loading={loading}
      error={error}
    >
      {segments.length === 0 && others.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <View style={styles.body}>
          {segments.length === 0 ? (
            <Text style={styles.empty}>{emptyLabel}</Text>
          ) : (
            <>
              <View style={styles.bar}>
                {segments.map((segment, index) => {
                  const share =
                    total.isZero() || !money.isPositive(segment.amount)
                      ? 0
                      : money.dec(segment.amount).dividedBy(total).toNumber();
                  const fill = {
                    flexGrow: share === 0 ? 0 : Math.max(share, 0.01),
                    minWidth: share === 0 ? 0 : space.xs,
                    backgroundColor: index < ramp.length ? ramp[index] : theme.chartOtherFill,
                  };
                  return <View key={segment.key} style={fill} />;
                })}
              </View>
              <View style={styles.legend}>
                {segments.map((segment, index) => {
                  const swatchFill = {
                    backgroundColor: index < ramp.length ? ramp[index] : theme.chartOtherFill,
                  };
                  return (
                    <View key={segment.key} style={styles.legendRow}>
                      <View style={[styles.swatch, swatchFill]} />
                      <Text style={styles.legendLabel}>{segment.label}</Text>
                      <Amount
                        value={segment.amount}
                        currency={segment.currency}
                        decimals={segment.decimals}
                        size="small"
                        kind="spend"
                      />
                    </View>
                  );
                })}
              </View>
            </>
          )}
          <OtherCurrencies rows={others} label={othersLabel} />
        </View>
      )}
    </WidgetCard>
  );
}

const useStyles = makeStyles((theme) => ({
  body: { gap: space.md },
  bar: { flexDirection: "row", height: space.xl, borderRadius: radius.xs, overflow: "hidden" },
  legend: { gap: space.xs },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  swatch: { width: space.lg, height: space.lg, borderRadius: radius.xs },
  legendLabel: { color: theme.text, flex: 1, ...text.ui("caption") },
  empty: { color: theme.textMuted, ...text.ui("body") },
}));
