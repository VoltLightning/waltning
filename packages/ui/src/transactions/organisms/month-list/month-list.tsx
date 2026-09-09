/**
 * `<MonthList>` — the year, S04's Months page (§3).
 *
 * **Every month carries its own two figures and a bar to compare them by.**
 * Money that came in and money that went out, drawn against the busiest month
 * of the year rather than against an absolute scale: the question the page
 * answers is *which months were heavy*, and that is a question about this year.
 *
 * **Income and spend are separate bars, not one net.** A month that took 8 000
 * and spent 8 000 nets to nothing and was not a quiet month; a single bar would
 * draw it as one. `FlowBar` on Summary makes the opposite choice for the
 * opposite reason — there the subject is what is left of one month, here it is
 * how twelve compare.
 *
 * **A month with nothing in it keeps its row.** A year is twelve months, and a
 * list that dropped the empty ones would change length as the ledger fills.
 */

import type * as money from "@waltning/core/money";
import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

export type MonthRow = {
  /** `YYYY-MM`, and the identity of the row. */
  month: string;
  /** The month's name as drawn — localised by the caller. */
  label: string;
  inflow: money.Money;
  spend: money.Money;
  currency: string;
  decimals: number;
  /** `0`–`1` each, already measured against the year's busiest month. */
  inflowShare: number;
  spendShare: number;
  /** A note where the month held currencies the figures leave out, else `null`. */
  note: string | null;
  ahead: boolean;
};

export type MonthListProps = {
  rows: readonly MonthRow[];
  /** The month the pager is on. At most one row. */
  current: string;
  labels: { inflow: string; spend: string };
  onPickMonth: (month: string) => void;
};

function MonthRowView({
  row,
  current,
  labels,
  onPickMonth,
}: {
  row: MonthRow;
  current: boolean;
  labels: { inflow: string; spend: string };
  onPickMonth: (month: string) => void;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const month = row.month;
  const press = useCallback(() => onPickMonth(month), [onPickMonth, month]);

  // Widths are the datum, not the design, so they are the one thing here that
  // `makeStyles` cannot hold.
  const inflowWidth = useMemo(
    () => ({ width: `${row.inflowShare * 100}%` }) as const,
    [row.inflowShare],
  );
  const spendWidth = useMemo(
    () => ({ width: `${row.spendShare * 100}%` }) as const,
    [row.spendShare],
  );

  return (
    <Pressable
      accessibilityRole="button"
      // The month, then both figures: a row that announced only its name would
      // make a reader open every month to find out which were heavy.
      accessibilityLabel={`${row.label}, ${labels.inflow} ${row.inflow}, ${labels.spend} ${row.spend}`}
      accessibilityState={{ selected: current }}
      {...(current ? SELECTED : UNSELECTED)}
      onPress={press}
      {...handlers}
      style={[styles.row, current ? styles.rowCurrent : null, focused ? styles.focused : null]}
    >
      {/*
        **A month still ahead is quieter in ink, never in opacity.** Dimming the
        whole row put its label at 2.7:1, its figures at 2.07 and its note at
        1.69, where 4.5 is required — a month nobody could read, drawn that way
        to say it holds nothing. Only the name steps back; the figures are
        already zero and say the same thing in their own colours.
      */}
      <Text style={[styles.label, row.ahead ? styles.labelAhead : null]} numberOfLines={1}>
        {row.label}
      </Text>

      {/*
        Decorative: both figures are stated beside the bars and in the row's
        accessible name, so a reader who cannot see them loses nothing.
      */}
      <View style={styles.bars} accessibilityElementsHidden {...HIDDEN}>
        <View style={styles.track}>
          <View style={[styles.fillIn, inflowWidth]} />
        </View>
        <View style={styles.track}>
          <View style={[styles.fillOut, spendWidth]} />
        </View>
      </View>

      <View style={styles.figures}>
        <Amount
          value={row.inflow}
          currency={row.currency}
          decimals={row.decimals}
          kind="income"
          size="compact"
        />
        <Amount
          value={row.spend}
          currency={row.currency}
          decimals={row.decimals}
          kind="spend"
          size="compact"
        />
      </View>

      {row.note === null ? null : <Text style={styles.note}>{row.note}</Text>}
    </Pressable>
  );
}

const MemoMonthRow = memo(MonthRowView);

function MonthListView({ rows, current, labels, onPickMonth }: MonthListProps) {
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <MemoMonthRow
          key={row.month}
          row={row}
          current={row.month === current}
          labels={labels}
          onPickMonth={onPickMonth}
        />
      ))}
    </View>
  );
}

/**
 * `react-native-web` maps neither `accessibilityState.selected` nor the native
 * hiding props, so both need their flat forms (`conformance.test.ts`).
 */
const SELECTED: { "aria-selected": true } = { "aria-selected": true };
const UNSELECTED: { "aria-selected": false } = { "aria-selected": false };
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };

export const MonthList = memo(MonthListView);

const useStyles = makeStyles((theme) => ({
  list: { gap: space.xs },
  row: {
    minHeight: touchTarget.min,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.sm,
    gap: space.xs,
  },
  rowCurrent: { backgroundColor: theme.accentFill },
  labelAhead: { color: theme.textMuted },
  label: { ...text.ui("bodySm", 600), color: theme.text },
  bars: { gap: space.xxs },
  track: {
    height: 6,
    borderRadius: radius.xs,
    backgroundColor: theme.subtleFill,
    overflow: "hidden",
  },
  fillIn: { height: "100%", backgroundColor: theme.income },
  fillOut: { height: "100%", backgroundColor: theme.spend },
  figures: { flexDirection: "row", justifyContent: "space-between" },
  note: { ...text.ui("caption"), color: theme.textMuted },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
}));
