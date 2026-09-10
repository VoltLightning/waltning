/**
 * `<SpendRows>` — where a period's money went, one category per row.
 *
 * **A row each, not one stacked bar.** `SpendByCategoryWidget` draws the same
 * §6 data as a single labelled bar, which is right in a dashboard grid where a
 * widget is one tile among several. On a phone the question is comparative —
 * *is groceries usual this month?* — and a row per category puts the label,
 * the bar and the figure on one baseline, so the eye reads down a column
 * instead of across a legend. Same data, same ramp, different question.
 *
 * **One colour for every bar, and the length is the magnitude.** The mockups
 * this was drawn from tinted each category separately; `02-tokens` §2.1 gives
 * the green ramp as the entire chart palette, so the first version ranked into
 * that. Both are wrong here for the same reason: `chartRamp`'s steps are
 * measured against *each other*, because they are adjacent segments of one
 * stacked bar. Separate bars are each measured against the same track, and
 * two of its five steps clear WCAG 1.4.11's 3:1 in light and four do in dark
 * — from the *other* end, because the ramp is one set of values for both
 * themes. So in dark the biggest category came out at 2.19:1 and the smallest
 * at 8.68:1, and magnitude read as *invisible*. `chartBar` is one value that
 * clears the floor in both; the bar's length was always the encoding.
 *
 * **Bars are proportional to the largest row, not to the total.** A share of
 * the total is what the stacked bar already says; here the useful comparison
 * is between the rows on screen, and scaling to the total leaves every bar
 * short and the differences between them small.
 *
 * **A non-positive amount takes no width.** A legal split can carry a discount
 * line, so a bucket can come back negative; the figure is stated and the bar
 * is empty, which is `SpendByCategoryWidget`'s own rule — two views of one
 * number disagreeing about what an empty bucket looks like is a reader
 * learning the rule twice.
 */

import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";

export type SpendRow = {
  key: string;
  label: string;
  amount: money.Money;
};

export type SpendRowsProps = {
  /** Ranked and folded by the screen — this draws whatever order it is handed. */
  rows: readonly SpendRow[];
  currency: string;
  decimals?: number;
};

const BAR_HEIGHT = 9;

export function SpendRows({ rows, currency, decimals = 2 }: SpendRowsProps) {
  const styles = useStyles();
  const theme = useTheme();

  // `money.cmp`, the way `SpendByCategoryWidget` folds its own total: a bar's
  // width is arithmetic on an amount, and `SPEC.md` §7.0's rule holds for it
  // as much as for a figure.
  const widest = rows.reduce(
    (largest, row) => (money.cmp(row.amount, largest) > 0 ? row.amount : largest),
    money.ZERO,
  );

  // Built above the JSX, never inside it: an object literal in a `style` array
  // splits a component's styling across two places, which is how a hardcoded
  // colour returns unnoticed. `dock.tsx`'s `[styles.root, clearance]` is the
  // precedent, and `tests/architecture.test.ts` enforces it.
  const drawn = rows.map((row) => ({
    ...row,
    fill: { width: `${share(row.amount, widest)}%` as const, backgroundColor: theme.chartBar },
  }));

  return (
    <View style={styles.root}>
      {drawn.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {row.label}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, row.fill]} />
          </View>
          <View style={styles.figure}>
            <Amount value={row.amount} currency={currency} decimals={decimals} size="small" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The row's width as a percentage of the widest, divided in decimal and turned
 * into a plain number only at the end — a CSS width is not money, but the
 * division that produces it is on money, and doing it in floats is how two
 * equal categories end up different lengths.
 */
function share(amount: money.Money, widest: money.Money): number {
  if (!money.isPositive(widest) || !money.isPositive(amount)) return 0;
  return money.dec(amount).dividedBy(money.dec(widest)).times(100).toNumber();
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.x3 },
  label: { width: 74, color: theme.text, ...text.ui("label") },
  track: {
    flex: 1,
    height: BAR_HEIGHT,
    borderRadius: radius.xs,
    backgroundColor: theme.subtleFill,
    overflow: "hidden",
  },
  fill: { height: BAR_HEIGHT, borderRadius: radius.xs },
  figure: { minWidth: 82, alignItems: "flex-end" },
}));
