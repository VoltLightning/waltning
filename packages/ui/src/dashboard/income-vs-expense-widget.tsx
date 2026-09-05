/**
 * `<IncomeVsExpenseWidget>` — `S01` §3/§4's `income_vs_expense` chart:
 * "hue **plus** marker shape and end labels" (§7.1) for the two series.
 *
 * **Paired bars, not `LineChart`'s two lines.** The same tokens argument
 * `spend-by-category-widget.tsx` makes: no chart library is in this slice's
 * dependency budget, and §7.1's actual requirement — the two series
 * distinguishable by more than hue, each bucket's own figures readable
 * directly — is met here by three channels rather than one.
 *
 * - **Hue.** `theme.income`/`theme.spend`, this app's two fixed money colours,
 *   carrying the same meaning `StatTile` and every transaction row give them.
 * - **Marker shape.** A triangle pointing up for income, down for expense,
 *   drawn beside every bar and repeated in the legend. This is the channel
 *   §7.1 actually names, and position alone — income above, expense below —
 *   was not it: a reader who cannot separate the hues has nothing to anchor
 *   *which* row is which once the pair scrolls past the legend.
 * - **End labels.** Each bar's own figure, through `<Amount>`, at its end.
 *
 * **A partial bucket is hatched and says so — it does not change hue.** The
 * trailing range ends at the current month, which on the 2nd is a two-day
 * figure standing beside five whole ones: steady income reads as a collapse
 * at the start of every month. So that bucket is marked. But repainting both
 * its bars `assertedFill` spent the one channel that says *which series this
 * is* to say *how complete this bucket is* — the partial month became the one
 * bucket where income and expense are the same colour, in a chart whose whole
 * point is telling them apart. §7.1 asks for hue **plus** shape; incomplete is
 * a third fact, and it gets the third channel.
 *
 * So `partial` keeps `theme.income`/`theme.spend` and lays `assertedFill`
 * hatching over the fill (P4's *asserted or aged*, the one thing amber means
 * system-wide) — the same tone, carried as texture rather than as the whole
 * bar. Its label carries "to date" as well, and the two agree.
 *
 * **A zero figure draws no bar at all.** Not a two-percent stub, not a
 * `minWidth` sliver: a month with no income and a month with a little income
 * looked alike under a floor, which is the one distinction this chart exists
 * to make. `spend-by-category-widget.tsx` follows the same rule for the same
 * reason, and the two are worth stating identically — an empty bucket is
 * empty, and the figure at the end of the row says how empty.
 */

import * as money from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { hairline, radius, space } from "../tokens.ts";
import { OtherCurrencies, type OtherCurrencyRow } from "./other-currencies";
import { WidgetCard, type WidgetFrame } from "./widget-card";

export type IncomeVsExpenseBar = {
  label: string;
  income: money.Money;
  expense: money.Money;
  currency: string;
  decimals: number;
  /** The bucket has not finished — its figures are month-to-date, not comparable to the others. */
  partial?: boolean | undefined;
};

export type IncomeVsExpenseWidgetProps = WidgetFrame & {
  title: string;
  bars: readonly IncomeVsExpenseBar[];
  /** Every other currency's totals over the same range — unconverted, never charted. */
  others: readonly OtherCurrencyRow[];
  othersLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  emptyLabel: string;
  loading?: boolean | undefined;
  error?: string | undefined;
};

/**
 * The hatch's own geometry, declared once and read by both the stylesheet and
 * the stripe count. Writing `hairline.width * 2 + space.xs` beside a
 * `hatchStripe` whose width is `hairline.width * 2` and a `hatch` whose gap is
 * `space.xs` is the same three numbers in two places: change the stripe and
 * the count keeps computing the old pitch, and the hatch silently under- or
 * over-draws with nothing failing.
 */
const HATCH_STRIPE_WIDTH = hairline.width * 2;
const HATCH_GAP = space.xs;
/** One stripe plus the gap after it — the distance from a stripe's left edge to the next one's. */
const HATCH_PITCH = HATCH_STRIPE_WIDTH + HATCH_GAP;
/**
 * The narrowest a fill is ever painted (`fill.minWidth` below) — the width
 * `Hatch` assumes until it is measured, so a bar is marked from its first
 * frame and in any renderer that never lays out.
 */
const BAR_MIN_WIDTH = space.xs;
const HATCH_MIN_STRIPES = Math.ceil(BAR_MIN_WIDTH / HATCH_PITCH);

/**
 * The `assertedFill` hatching laid over a partial bucket's fill. Stripes are
 * `View`s rather than a background image: RN has no CSS gradient and this
 * module carries no drawing dependency, the same argument `Marker` makes for
 * drawing its triangle out of borders.
 *
 * **The count is measured, not guessed.** A fixed forty stripes covered
 * `HATCH_PITCH × 40` and no more, so the moment the partial bucket was the
 * *largest* one in the range — a January against a quiet December, or the
 * first month of a new job — its bar ran full width and the hatch stopped
 * partway across it. The mark that says "this month is not finished" then
 * covered the left of the bar and left the right plain, which reads as two
 * segments rather than as one incomplete figure. `onLayout` gives this
 * element its own width (it is absolutely positioned to fill the bar, so that
 * *is* the bar's width) and the stripe count follows from it.
 *
 * **Before the first layout pass it draws the minimum bar's worth of stripes**
 * rather than none. `onLayout` is a real renderer's callback: jsdom never
 * fires it, so a zero default meant the mark existed only where a browser had
 * measured the bar — the partial bucket was unmarked in every headless render
 * and in every unit test, which is precisely where a regression would have to
 * be caught. `BAR_MIN_WIDTH` is the narrowest fill this widget paints, so the
 * default is the honest floor: at least one stripe, never a gap in the chart,
 * and the measured count replaces it the moment a layout arrives.
 */
function Hatch() {
  const styles = useStyles();
  const [width, setWidth] = useState<number | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const stripes = useMemo(() => {
    const count = width === null ? HATCH_MIN_STRIPES : Math.ceil(width / HATCH_PITCH);
    return Array.from({ length: count }, (_, i) => `stripe-${i}`);
  }, [width]);
  return (
    <View testID="partial-hatch" style={styles.hatch} onLayout={handleLayout}>
      {stripes.map((key) => (
        <View key={key} style={styles.hatchStripe} />
      ))}
    </View>
  );
}

/** The triangle both the legend and every bar row draw — up for income, down for expense. */
function Marker({ direction, color }: { direction: "up" | "down"; color: string }) {
  const styles = useStyles();
  const tint = direction === "up" ? { borderBottomColor: color } : { borderTopColor: color };
  return <View style={[direction === "up" ? styles.markerUp : styles.markerDown, tint]} />;
}

export function IncomeVsExpenseWidget({
  title,
  currency,
  period,
  scope,
  bars,
  others,
  othersLabel,
  incomeLabel,
  expenseLabel,
  emptyLabel,
  loading,
  error,
}: IncomeVsExpenseWidgetProps) {
  const styles = useStyles();
  const theme = useTheme();
  // The taller bar sets the scale both series share — an income bucket and an
  // expense bucket drawn against two different maxima would be two charts
  // wearing one axis.
  const max = bars
    .flatMap((bar) => [money.dec(bar.income), money.dec(bar.expense)])
    .reduce((tallest, value) => (value.greaterThan(tallest) ? value : tallest), money.dec(0));

  return (
    <WidgetCard
      title={title}
      currency={currency}
      period={period}
      scope={scope}
      loading={loading}
      error={error}
    >
      {bars.length === 0 && others.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <View style={styles.chart}>
          {bars.length === 0 ? (
            <Text style={styles.empty}>{emptyLabel}</Text>
          ) : (
            <>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <Marker direction="up" color={theme.income} />
                  <Text style={styles.legendLabel}>{incomeLabel}</Text>
                </View>
                <View style={styles.legendItem}>
                  <Marker direction="down" color={theme.spend} />
                  <Text style={styles.legendLabel}>{expenseLabel}</Text>
                </View>
              </View>
              {bars.map((bar) => {
                // A zero figure is zero width and renders no fill — see the
                // file doc. Everything else is its share of the shared scale.
                const incomeShare = max.isZero()
                  ? 0
                  : money.dec(bar.income).dividedBy(max).toNumber();
                const expenseShare = max.isZero()
                  ? 0
                  : money.dec(bar.expense).dividedBy(max).toNumber();
                const incomeFillGrow = { flexGrow: incomeShare };
                const incomeTrackGrow = { flexGrow: 1 - incomeShare };
                const expenseFillGrow = { flexGrow: expenseShare };
                const expenseTrackGrow = { flexGrow: 1 - expenseShare };
                return (
                  <View key={bar.label} style={styles.bucket}>
                    <Text style={styles.bucketLabel}>{bar.label}</Text>
                    <View style={styles.pair}>
                      <Marker direction="up" color={theme.income} />
                      <View style={styles.track}>
                        {incomeShare === 0 ? null : (
                          <View style={[styles.fill, styles.incomeFill, incomeFillGrow]}>
                            {bar.partial ? <Hatch /> : null}
                          </View>
                        )}
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
                      <Marker direction="down" color={theme.spend} />
                      <View style={styles.track}>
                        {expenseShare === 0 ? null : (
                          <View style={[styles.fill, styles.expenseFill, expenseFillGrow]}>
                            {bar.partial ? <Hatch /> : null}
                          </View>
                        )}
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
            </>
          )}
          <OtherCurrencies rows={others} label={othersLabel} />
        </View>
      )}
    </WidgetCard>
  );
}

const useStyles = makeStyles((theme) => ({
  chart: { gap: space.md },
  legend: { flexDirection: "row", gap: space.lg },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  // The border trick, not an SVG: RN and RNW both draw a triangle from three
  // borders, and this module carries no drawing dependency at all.
  markerUp: {
    width: 0,
    height: 0,
    borderLeftWidth: space.xs,
    borderRightWidth: space.xs,
    borderBottomWidth: space.sm,
    borderStyle: "solid",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  markerDown: {
    width: 0,
    height: 0,
    borderLeftWidth: space.xs,
    borderRightWidth: space.xs,
    borderTopWidth: space.sm,
    borderStyle: "solid",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
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
  fill: { minWidth: BAR_MIN_WIDTH, overflow: "hidden" },
  incomeFill: { backgroundColor: theme.income },
  expenseFill: { backgroundColor: theme.spend },
  /**
   * P4's *asserted or aged* — the one meaning amber carries system-wide, laid
   * over the series hue rather than replacing it.
   */
  hatch: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    gap: HATCH_GAP,
  },
  hatchStripe: { width: HATCH_STRIPE_WIDTH, backgroundColor: theme.assertedFill },
  empty: { color: theme.textMuted, ...text.ui("body") },
}));
