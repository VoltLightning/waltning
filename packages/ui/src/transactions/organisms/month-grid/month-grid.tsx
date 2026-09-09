/**
 * `<MonthGrid>` — the month's shape, S04's Calendar page (§3).
 *
 * **The same cell the ribbon uses, without its weekday line.** The mark's
 * three channels — size for how much moved, colour for which way, ring against
 * fill so the direction survives without colour — are `DayCell`'s and are not
 * restated here. A grid that drew its own marks would be a second answer to
 * the same question, and the two would drift the first time either changed.
 *
 * **The weekday is a column heading, once.** It is the same word for every
 * cell in the column, and thirty repetitions of it is what the ribbon needs
 * (its days are not in columns) and a grid does not.
 *
 * **Blanks are `View`s, not disabled cells.** A cell that can be reached and
 * refuses is a promise the layout did not mean to make; the days before the
 * 1st belong to another month, and this grid does not draw that month.
 */

import { memo, useCallback } from "react";
import { Text, View } from "react-native";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import type { DayActivity, DayDirection } from "../../atoms/day-cell/day-cell";
import { DayCell } from "../../atoms/day-cell/day-cell";

/**
 * One drawn day.
 *
 * **Declared here rather than imported from `packages/client`**, which this
 * package may not import at all (`architecture/11`): `client` sits beside
 * `ui`, not under it. The model's `MonthDay` satisfies this structurally, so
 * the screen composes the two without either package knowing the other — the
 * same seam `RibbonDay` keeps for the ribbon.
 */
export type GridDay = {
  /** `YYYY-MM-DD`, and the identity of the cell. */
  date: string;
  /** Day of the month, as drawn. */
  day: number;
  activity: DayActivity;
  /** Which way the day netted. `flat` is money that moved and left nothing. */
  direction: DayDirection;
  /** After today — reachable, and drawn quieter. */
  ahead: boolean;
};

/**
 * A cell this grid leaves empty — a day of the month either side of this one.
 * It carries its date so no cell is identified by where it sits in the row.
 */
export type GridBlank = { blank: true; date: string };

/** One row of the grid — seven cells, some belonging to the months either side. */
export type GridWeek = readonly (GridDay | GridBlank)[];

export type MonthGridProps = {
  weeks: readonly GridWeek[];
  /**
   * The seven columns, already localised and in the week's own order. `key` is
   * the heading's own date: two columns can share a letter (English has two
   * Tuesdays' worth of "T"), so the letter cannot identify the column.
   */
  headings: readonly { key: string; label: string }[];
  /** The day the pager is on. At most one cell. */
  current: string;
  /** The real today, which stays marked wherever the pager has moved. */
  today: string;
  /** The full date and what happened, for a reader who cannot see the number. */
  labelFor: (date: string) => string;
  onPickDay: (date: string) => void;
  /**
   * §7's match counts, keyed by date — present only while the screen is
   * searching, and then every cell carries one *instead of* its activity mark.
   *
   * A map rather than a field on `GridDay`: the weeks come from `monthGrid`,
   * which folds flows and has no business knowing what a search is.
   */
  matches?: ReadonlyMap<string, number> | undefined;
};

function GridCell({
  date,
  day,
  activity,
  direction,
  ahead,
  current,
  today,
  label,
  onPickDay,
  matches,
}: GridDay & {
  current: boolean;
  today: boolean;
  label: string;
  matches: number | undefined;
  onPickDay: (date: string) => void;
}) {
  const press = useCallback(() => onPickDay(date), [onPickDay, date]);
  return (
    <DayCell
      day={day}
      activity={activity}
      direction={direction}
      ahead={ahead}
      current={current}
      today={today}
      {...(matches === undefined ? {} : { matches })}
      accessibilityLabel={label}
      onPress={press}
    />
  );
}

const MemoGridCell = memo(GridCell);

function MonthGridView({
  weeks,
  headings,
  current,
  today,
  labelFor,
  onPickDay,
  matches,
}: MonthGridProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <View style={styles.headings}>
        {headings.map((heading) => (
          // The letter is ambiguous by construction — two Tuesdays and two
          // Thursdays read "T" in English — so it is decorative here and every
          // cell below carries its own full date as an accessible name.
          <View
            key={heading.key}
            style={styles.heading}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            {...HIDDEN}
          >
            <Text style={styles.headingText}>{heading.label}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={firstDateOf(week)} style={styles.week}>
          {week.map((cell: GridDay | GridBlank) =>
            "blank" in cell ? (
              <View key={cell.date} style={styles.blank} />
            ) : (
              <View key={cell.date} style={styles.cell}>
                <MemoGridCell
                  date={cell.date}
                  day={cell.day}
                  activity={cell.activity}
                  direction={cell.direction}
                  ahead={cell.ahead}
                  current={cell.date === current}
                  today={cell.date === today}
                  label={labelFor(cell.date)}
                  matches={matches === undefined ? undefined : (matches.get(cell.date) ?? 0)}
                  onPickDay={onPickDay}
                />
              </View>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/** A week's key: its first cell's date. Every cell has one, blanks included. */
function firstDateOf(week: GridWeek): string {
  return week[0]?.date ?? "empty";
}

/**
 * `react-native-web` maps neither native hiding prop, so the headings would
 * otherwise be read out before every row (`conformance.test.ts`).
 */
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };

export const MonthGrid = memo(MonthGridView);

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xs },
  headings: { flexDirection: "row" },
  heading: { flex: 1, alignItems: "center", paddingVertical: space.xs },
  headingText: { ...text.ui("caption", 600), color: theme.textMuted },
  week: { flexDirection: "row" },
  // `flex: 1` on the wrapper rather than on the cell: the cell owns the 44pt
  // floor, and a floor that also had to stretch would be two rules fighting
  // over one number.
  cell: { flex: 1, alignItems: "stretch" },
  blank: { flex: 1 },
}));
