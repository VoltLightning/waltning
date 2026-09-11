/**
 * `<MonthList>` — the year's figures, under the chart that gives it a shape
 * (S04 §3).
 *
 * **The rows carry what `<YearChart>` cannot.** The chart answers *which months
 * were heavy* at a glance and cannot state a number; these state the numbers and
 * cannot be glanced at. Each does one of the two jobs the page has.
 *
 * **The bars are gone from here, and they were the whole problem.** A row used
 * to draw two of its own, scaled to the busiest month — twenty-four tracks down
 * the page, and on a year holding nothing, twenty-four *full-width* tracks: a
 * month with no entries drawn exactly like a month with everything. The chart
 * carries the comparison now, where an empty month is a stub rather than a
 * track.
 *
 * **In and out, then the net.** A month that took 8 000 and spent 8 000 nets to
 * nothing and was not a quiet month, so the two figures lead and the net
 * follows them rather than replacing them.
 *
 * **A month with nothing in it keeps its row.** A year is twelve months, and a
 * list that dropped the empty ones would change length as the ledger fills.
 */

import type * as money from "@waltning/core/money";
import { memo, useCallback } from "react";
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
  /** `inflow − spend`, already computed — the row states it, never derives it. */
  net: money.Money;
  /** A note where the month held currencies the figures leave out, else `null`. */
  note: string | null;
  ahead: boolean;
  /**
   * §7's match count for this month, already localised — *3 matches* — or
   * `null` when the screen is not searching.
   *
   * **It replaces the bars and the figures; it does not join them.** §7 says
   * Months carries match counts *instead of* its figures, and for a reason the
   * row makes obvious: the bars are drawn against the busiest month of the
   * year, which under a search would still be scaled by money nobody asked
   * about. A localised string rather than a number, the way `note` already is —
   * plurals are the caller's, and this component holds no catalogue.
   */
  matches: { label: string; found: boolean } | null;
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

  return (
    <Pressable
      accessibilityRole="button"
      // The month, then both figures: a row that announced only its name would
      // make a reader open every month to find out which were heavy.
      accessibilityLabel={
        row.matches === null
          ? `${row.label}, ${labels.inflow} ${row.inflow}, ${labels.spend} ${row.spend}`
          : `${row.label}, ${row.matches.label}`
      }
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

      {row.matches === null ? (
        <View style={styles.figures}>
          <Amount
            value={row.inflow}
            currency={row.currency}
            decimals={row.decimals}
            kind="income"
            size="caption"
          />
          <Amount
            value={row.spend}
            currency={row.currency}
            decimals={row.decimals}
            kind="spend"
            size="caption"
          />
          <View style={styles.net}>
            <Amount
              value={row.net}
              currency={row.currency}
              decimals={row.decimals}
              size="small"
              signed
            />
          </View>
        </View>
      ) : (
        <Text style={row.matches.found ? styles.matches : styles.matchesNone}>
          {row.matches.label}
        </Text>
      )}

      {/*
        The currency note is about the figures, so it goes with them. Under a
        search there are no figures for it to qualify.
      */}
      {row.note === null || row.matches !== null ? null : (
        <Text style={styles.note}>{row.note}</Text>
      )}
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

/** `react-native-web` maps no `accessibilityState.selected`; the flat form does. */
const SELECTED: { "aria-selected": true } = { "aria-selected": true };
const UNSELECTED: { "aria-selected": false } = { "aria-selected": false };

export const MonthList = memo(MonthListView);

const useStyles = makeStyles((theme) => ({
  list: { gap: space.xs },
  row: {
    // The selected row draws an edge; every other row reserves its width in a
    // transparent one, or selecting a month would nudge the whole list by 2px.
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.sm,
    gap: space.xxs,
  },
  /**
   * **A selected row has to be visible, and this one measured 1.07:1.**
   * `accentFill` on `ground` is a tint you cannot find: the month the pager is
   * on looked exactly like the eleven it is not. The fill stays — it is the
   * right colour — and the edge is what makes it a shape, the same pairing
   * `ActiveFilterChip` already uses for the same reason. 1.66 in light and 2.15
   * in dark, against a fill that carries 1.07 and 1.32 alone.
   */
  rowCurrent: {
    backgroundColor: theme.accentFill,
    borderWidth: 1,
    borderColor: theme.accentFillBorder,
  },
  labelAhead: { color: theme.textMuted },
  label: { ...text.ui("label"), color: theme.text },
  /**
   * The two figures lead and the net follows, on one line. The net is given
   * fixed room so twelve of them align down the page — a column of figures that
   * does not is a column you cannot compare.
   */
  figures: { flexDirection: "row", alignItems: "baseline", gap: space.xl },
  net: { marginLeft: "auto", minWidth: 92, alignItems: "flex-end" },
  note: { ...text.ui("caption"), color: theme.textMuted },
  matches: { ...text.ui("bodySm"), color: theme.accentText },
  /**
   * **A month with nothing found is quiet, not absent.** *Not in this month* is
   * part of §7's *how often, and when*, so the row keeps its answer — but
   * twelve rows shouting `0 matches` in accent ink is a page that says nothing
   * twelve times, which is the same reason the grid draws an empty cell rather
   * than a zero.
   */
  matchesNone: { ...text.ui("bodySm"), color: theme.textMuted },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
}));
