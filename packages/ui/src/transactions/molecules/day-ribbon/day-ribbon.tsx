/**
 * `<DayRibbon>` — the continuous run of days under `DateStrip`, S04 §3.
 *
 * **It scrolls; it does not page.** A week strip advancing a week at a time
 * is a control with its own position, and a control with its own position
 * beside a list with one is two sources of truth for *what day am I on* —
 * they diverge on the first fling. This translates with the list instead, and
 * is clipped at both edges so the slivers say there is more in both
 * directions.
 *
 * **It reports; it does not select.** `current` marks whichever day the list
 * is showing. Tapping a cell asks the list to go there, and the mark follows
 * because the list moved — never because the ribbon decided.
 *
 * **Nothing here is measured from a date.** The caller hands over days that
 * are already resolved: the weekday letter localised, the activity classed,
 * the accessible name written. A ribbon that formatted its own dates would
 * need `useT()` and a timezone per cell, sixty times a fling.
 */

import { memo, useCallback } from "react";
import { ScrollView } from "react-native";
import { horizontalScrollProps } from "../../../primitives/nested-scroll.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { type DayActivity, DayCell, type DayDirection } from "../../atoms/day-cell/day-cell";

export type RibbonDay = {
  /** `YYYY-MM-DD`, and the identity of the cell. */
  date: string;
  /** Day of the month, as drawn. */
  day: number;
  /** One localised letter. */
  weekday: string;
  activity: DayActivity;
  /** Which way the day netted. Absent is `flat` — money moved and none of it left. */
  direction?: DayDirection;
  today?: boolean;
  ahead?: boolean;
  /** The full date and what happened — what a screen reader hears instead of "14". */
  label: string;
};

export type DayRibbonProps = {
  days: readonly RibbonDay[];
  /** The day the list is showing. `null` while the list is between days. */
  current: string | null;
  onPickDay: (date: string) => void;
};

/**
 * One cell's worth of wiring, memoised **with its own handler**.
 *
 * The handler is the whole reason this exists. `onPress={() => onPickDay(d.date)}`
 * in the map below would hand every cell a fresh function on every ribbon
 * render, and `DayCell`'s `memo` would compare it, find it different, and
 * re-render — a memo that measurably does nothing while looking like it
 * works. `useCallback` per cell keyed on the date is what makes the memo
 * real, and `day-ribbon.test.tsx` counts the renders rather than trusting it.
 */
function RibbonCell({
  day,
  current,
  onPickDay,
}: {
  day: RibbonDay;
  current: boolean;
  onPickDay: (date: string) => void;
}) {
  const date = day.date;
  const press = useCallback(() => onPickDay(date), [onPickDay, date]);
  return (
    <DayCell
      weekday={day.weekday}
      day={day.day}
      activity={day.activity}
      direction={day.direction ?? "flat"}
      current={current}
      today={day.today ?? false}
      ahead={day.ahead ?? false}
      accessibilityLabel={day.label}
      onPress={press}
    />
  );
}

const MemoRibbonCell = memo(RibbonCell);

function DayRibbonView({ days, current, onPickDay }: DayRibbonProps) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A bounded scroller inside a page that scrolls the other way: it must
      // contain its own overscroll or a fling along it drags the list behind.
      {...horizontalScrollProps(styles.band)}
      contentContainerStyle={styles.track}
      // A ribbon is a run of days, not a list of controls to tab through one
      // by one — a keyboard reader reaches a date through the picker, which
      // is a grid and says so.
      accessibilityRole="list"
    >
      {days.map((day) => (
        <MemoRibbonCell
          key={day.date}
          day={day}
          current={day.date === current}
          onPickDay={onPickDay}
        />
      ))}
    </ScrollView>
  );
}

export const DayRibbon = memo(DayRibbonView);

const useStyles = makeStyles(() => ({
  /**
   * **`flexGrow: 0` is what keeps this a strip.**
   *
   * `react-native-web` gives a `ScrollView` a growing base style, so in the
   * column this sits in it took every point the page had and pushed the list
   * under it to the bottom of the screen — a ribbon with one cell and a
   * screen's worth of nothing beneath it. It was invisible while the pager's
   * slots were unbounded and appeared the moment they were sized, which is
   * where the bug had been waiting.
   */
  band: { flexGrow: 0, flexShrink: 0, paddingVertical: space.sm },
  track: { flexDirection: "row", gap: space.xs, paddingHorizontal: space.x3 },
}));

export type { DayActivity, DayDirection };
