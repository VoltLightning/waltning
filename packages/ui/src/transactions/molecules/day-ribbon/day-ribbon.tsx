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
 * **Earliest at the left.** The list above it is reverse-chronological because
 * a ledger is read from the top; that is a rule about a vertical axis, and
 * carried onto a horizontal one it drew a week running backwards next to a
 * `MonthGrid`, on the same screen, running forwards. S04 §4 fixes the strip's
 * continuity and its clipped edges and leaves the direction open; `ledger-days`
 * sorts the days, and this scrolls the one the list is on into view so the
 * newest end is not the end the reader has to hunt for.
 *
 * **Nothing here is measured from a date.** The caller hands over days that
 * are already resolved: the weekday letter localised, the activity classed,
 * the accessible name written. A ribbon that formatted its own dates would
 * need `useT()` and a timezone per cell, sixty times a fling.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, ScrollView } from "react-native";
import { horizontalScrollProps } from "../../../primitives/nested-scroll.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { type DayActivity, DayCell, type DayDirection } from "../../atoms/day-cell/day-cell";

/**
 * One cell's footprint along the strip — `DayCell`'s own 48 plus the track's
 * gap. Arithmetic rather than measurement: sixty cells reporting their layout
 * during a fling is the cost this component's memoisation exists to avoid, and
 * the width is a constant in the cell that draws it.
 */
const CELL = 48;
const STRIDE = CELL + space.xs;
/**
 * The track's leading padding, which every cell's position is measured from.
 *
 * Measured in Chrome against the running app rather than assumed: cell 0's
 * `offsetLeft` is 16, not 0, and a first version that left this out centred
 * every cell 16px to the left of where it was asked to.
 */
const TRACK_LEAD = space.x3;

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

/**
 * Where the strip must sit for the cell at `index` to be in the middle of a
 * band `band` wide — or `null` when there is nothing to scroll to.
 *
 * **Its own function because jsdom cannot answer it.** `onLayout` is a
 * `ResizeObserver` on the web and a native measure on the phone, and neither
 * runs under the component suite — so the effect that calls this never fires
 * there and the arithmetic would be untested code inside a tested component.
 * A story with more days than fit carries the rendered half, in a browser that
 * has layout.
 *
 * Clamped at zero at the near end only: the scroller clamps its own far end,
 * and a maximum computed here would need the content width, which is the one
 * number this component never measures.
 */
export function offsetFor(index: number, band: number): number | null {
  if (index < 0 || band === 0) return null;
  return Math.max(0, TRACK_LEAD + index * STRIDE + CELL / 2 - band / 2);
}

/**
 * Which cell stands for `current` — **the day itself, or the nearest one the
 * strip holds at or before it.**
 *
 * The strip runs between the first and last day the *list has loaded*, and a
 * day with no rows on it is not one of those: on any day the reader has not
 * captured anything, the anchor — today included — has no cell at all. An exact
 * match alone left the strip unscrolled, which put its oldest loaded day at the
 * left edge while the list sat at the newest, and that is the same *strip and
 * list disagree* the anchor rule exists to prevent.
 *
 * At or before, never after: the list is reverse-chronological, so the day
 * nearest the anchor in the direction the reader is about to scroll is the one
 * below it. `-1` only when the strip holds nothing at all or every day it holds
 * is later than the anchor, and then the first cell is as near as it gets.
 */
export function cellFor(days: readonly { date: string }[], current: string | null): number {
  if (current === null || days.length === 0) return -1;
  let at = -1;
  // Ascending, so the last cell that is not past `current` is the nearest one
  // below it. A linear walk over at most a page of days, once per anchor
  // change — not per frame.
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (day === undefined || day.date > current) break;
    at = i;
  }
  // Every loaded day is later than the anchor — a jump forward past the newest
  // row. The first cell is the nearest thing the strip has to where the list is.
  return at === -1 ? 0 : at;
}

function DayRibbonView({ days, current, onPickDay }: DayRibbonProps) {
  const styles = useStyles();
  const scroller = useRef<ScrollView>(null);
  // The band's own width, which decides where the middle is. `0` until the
  // first layout, and the effect below simply does not scroll then — there is
  // nothing to centre in a box with no width.
  const [band, setBand] = useState(0);
  const measure = useCallback((event: LayoutChangeEvent) => {
    setBand(event.nativeEvent.layout.width);
  }, []);

  /**
   * **The day the list is on, centred.**
   *
   * The strip runs earliest-first, so on a cold open the day a reader cares
   * about — today — is at the far right, off screen. `current` is what the
   * ribbon reports; a report the reader has to scroll to find is not one.
   *
   * Not animated: this runs when the list *jumps*, and S04 §7 suppresses the
   * scroll-to-date transition under reduce-motion anyway — a strip that slid
   * every time the anchor moved would be a second animation over the page
   * transition already playing.
   *
   * It also re-runs when an older page prepends days and every index shifts,
   * which is what *keeps* the current cell where it was — the content grew on
   * the same side. The cost is that a reader who scrolled the strip by hand
   * loses that position when the list pages; the strip reports where the list
   * is, so following the list is the behaviour to keep.
   */
  const index = cellFor(days, current);
  useEffect(() => {
    const x = offsetFor(index, band);
    if (x === null) return;
    scroller.current?.scrollTo({ x, animated: false });
  }, [index, band]);

  return (
    <ScrollView
      ref={scroller}
      onLayout={measure}
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
