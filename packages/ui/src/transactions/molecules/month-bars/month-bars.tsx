/**
 * `<MonthBars>` — six months side by side, the last one this transaction's,
 * with its share drawn in the ramp's darkest step on top of that month's bar
 * (`screens/S09-transaction-detail.md` §3, `computations.md` §6a).
 *
 * **Greens only.** The ramp is the whole chart palette (`design-system/02`):
 * magnitude reads as depth, so the past is the lightest step, the month in
 * question one deeper, and this transaction the deepest.
 *
 * Heights are proportions of the tallest month — a ratio of two amounts, so
 * the one `Number` here is a layout fraction, never money.
 */

import type { YearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { monthShort } from "../../../i18n/locales.ts";
import { useLocale } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";

export type MonthBarsMonth = { month: YearMonth; total: money.Money };

export type MonthBarsProps = {
  /** Oldest first; the last is the transaction's own month. */
  months: readonly MonthBarsMonth[];
  /** This transaction's part of the last month; `null` draws none. */
  share: money.Money | null;
};

const HEIGHT = 64;

function fraction(part: money.Money, whole: money.Money): number {
  if (!money.isPositive(whole)) return 0;
  return Math.min(1, money.dec(part).div(whole).toNumber());
}

export function MonthBars({ months, share }: MonthBarsProps) {
  const styles = useStyles();
  let tallest = money.ZERO;
  for (const entry of months) {
    if (money.dec(entry.total).greaterThan(tallest)) tallest = entry.total;
  }

  return (
    <View style={styles.row}>
      {months.map((entry, index) => (
        <Bar
          key={entry.month}
          entry={entry}
          own={index === months.length - 1}
          tallest={tallest}
          share={share}
        />
      ))}
    </View>
  );
}

type BarProps = {
  entry: MonthBarsMonth;
  own: boolean;
  tallest: money.Money;
  share: money.Money | null;
};

function Bar({ entry, own, tallest, share }: BarProps) {
  const styles = useStyles();
  const locale = useLocale();
  const height = Math.max(2, Math.round(HEIGHT * fraction(entry.total, tallest)));
  const shareHeight = own && share !== null ? Math.round(height * fraction(share, entry.total)) : 0;
  const barSize = { height };
  const shareSize = { height: shareHeight };
  return (
    <View style={styles.column}>
      <View style={styles.room}>
        <View style={[styles.bar, own ? styles.ownBar : null, barSize]}>
          {shareHeight > 0 ? <View style={[styles.share, shareSize]} /> : null}
        </View>
      </View>
      <Text style={[styles.label, own ? styles.ownLabel : null]}>
        {monthShort(entry.month, locale)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: "row", gap: space.md },
  column: { flex: 1, alignItems: "center", gap: space.xs },
  room: { height: HEIGHT, alignSelf: "stretch", justifyContent: "flex-end" },
  bar: {
    backgroundColor: theme.chartRamp[4],
    borderTopLeftRadius: radius.xs,
    borderTopRightRadius: radius.xs,
    overflow: "hidden",
  },
  ownBar: { backgroundColor: theme.chartRamp[3] },
  share: { backgroundColor: theme.chartRamp[0] },
  label: { color: theme.textMuted, ...text.ui("caption") },
  ownLabel: { color: theme.text, ...text.ui("caption", 600) },
}));
