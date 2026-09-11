/**
 * `<YearChart>` — the year as twelve paired columns, and the control that moves
 * between years (S04 §3).
 *
 * **The shape answers the page's question before any figure is read.** Months
 * exists to say *which months were heavy*; twelve rows of figures make that a
 * reading task, and a chart makes it a glance. The rows beneath carry what the
 * chart cannot — the figures themselves.
 *
 * **Scaled to the busiest month of the year on screen, never to an absolute.**
 * `DayRibbon` gives the reason: a ledger whose largest month is 200 and one
 * whose largest is 20 000 would otherwise draw every column the same, and the
 * mark exists to say *this was unusual for you*.
 *
 * **A month with nothing draws a stub, not a full-height empty track.** Twelve
 * empty tracks is a year holding nothing drawn as a year holding everything —
 * the defect this page was redesigned around. The stub is the border colour, so
 * an empty month reads as an absence rather than a quantity.
 *
 * **The year's own arrows live here, not only in the chrome.** The chart is the
 * year, so the control that changes it belongs on the chart where the eye
 * already is; §4's rule that the header's arrows step the unit the page is in
 * still holds, and both do the same thing.
 */

import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../../../primitives/interaction.ts";
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from "../../../shell/phosphor";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

const ICON = 17;
/** The tallest a column grows. The card is sized from it. */
const COLUMN = 104;
/** What a month with nothing draws instead of a column. */
const STUB = 2;

export type YearColumn = {
  /** `2026-01`, the identity of the column. */
  month: string;
  /** One letter, localised by the caller — the column is too narrow for more. */
  initial: string;
  /** `0`–`1` each, already measured against the busiest month of this year. */
  inflowShare: number;
  spendShare: number;
  /** True where the month holds nothing at all. */
  empty: boolean;
};

export type YearChartProps = {
  year: number;
  columns: readonly YearColumn[];
  /** The month the pager is on. Marked under its column. */
  current: string;
  /** The year's own net, already rendered — an `<Amount>`, or nothing yet. */
  kept: React.ReactNode;
  /** Absent where the ledger cannot go further in that direction. */
  onOlder?: (() => void) | undefined;
  onNewer?: (() => void) | undefined;
  /** Opens the year picker — a jump of more than one step. */
  onPickYear: () => void;
  labels: { older: string; newer: string; pickYear: string };
};

function Step({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: (() => void) | undefined;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const spent = onPress === undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: spent }}
      disabled={spent}
      onPress={onPress}
      {...handlers}
      style={[styles.step, focused ? styles.focused : null]}
    >
      {children}
    </Pressable>
  );
}

function Column({ column, current }: { column: YearColumn; current: boolean }) {
  const styles = useStyles();
  // The one value `makeStyles` cannot hold: it is the datum, not the design.
  const inflow = { height: column.empty ? STUB : Math.max(STUB, column.inflowShare * COLUMN) };
  const spend = { height: column.empty ? STUB : Math.max(STUB, column.spendShare * COLUMN) };
  return (
    <View style={styles.column}>
      <View style={styles.bars}>
        <View style={[styles.bar, column.empty ? styles.barEmpty : styles.barIn, inflow]} />
        <View style={[styles.bar, column.empty ? styles.barEmpty : styles.barOut, spend]} />
      </View>
      <Text style={[styles.initial, current ? styles.initialCurrent : null]}>{column.initial}</Text>
      {/* The same 2px accent `PageTabs` marks its own selection with, so one
          mark means *you are here* everywhere on this screen. */}
      <View style={[styles.tick, current ? styles.tickCurrent : null]} />
    </View>
  );
}

const MemoColumn = memo(Column);

function YearChartView({
  year,
  columns,
  current,
  kept,
  onOlder,
  onNewer,
  onPickYear,
  labels,
}: YearChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { focused, handlers } = useInteraction();

  return (
    <View style={styles.card}>
      <View style={styles.yearRow}>
        <Step onPress={onOlder} accessibilityLabel={labels.older}>
          <CaretLeftIcon size={ICON} color={onOlder ? theme.text : theme.textFaint} />
        </Step>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.pickYear}
          onPress={onPickYear}
          {...handlers}
          style={[styles.yearButton, focused ? styles.focused : null]}
        >
          <View style={styles.yearLine}>
            <Text style={styles.year}>{year}</Text>
            <CaretDownIcon size={12} color={theme.textMuted} />
          </View>
          {kept}
        </Pressable>

        <Step onPress={onNewer} accessibilityLabel={labels.newer}>
          <CaretRightIcon size={ICON} color={onNewer ? theme.text : theme.textFaint} />
        </Step>
      </View>

      <View style={styles.columns}>
        {columns.map((column) => (
          <MemoColumn key={column.month} column={column} current={column.month === current} />
        ))}
      </View>
    </View>
  );
}

export const YearChart = memo(YearChartView);

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  yearButton: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  yearLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  year: { ...text.display("displayThree"), color: theme.text },
  columns: { flexDirection: "row", alignItems: "flex-end", gap: space.xxs },
  column: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.sm,
    minHeight: touchTarget.min,
  },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: space.xxs, height: COLUMN },
  bar: { width: 7, borderTopLeftRadius: radius.xs, borderTopRightRadius: radius.xs },
  barIn: { backgroundColor: theme.income },
  barOut: { backgroundColor: theme.spend },
  /** An absence, not a quantity — the same edge colour the card is drawn in. */
  barEmpty: { backgroundColor: theme.border },
  initial: { ...text.ui("tag"), color: theme.textMuted },
  initialCurrent: { color: theme.text },
  // The mark `PageTabs` draws under its own selection, at its own size.
  tick: { width: 16, height: 2, borderRadius: radius.xs },
  tickCurrent: { backgroundColor: theme.accent },
}));
