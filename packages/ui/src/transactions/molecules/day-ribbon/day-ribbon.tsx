/**
 * `<DayRibbon>` — the continuous run of days under `PageTabs`, S04 §3.
 *
 * **A scrubber, not a selector.** The ring is fixed at the middle of the band
 * and never moves; what moves under it is the run of days, driven by the
 * list's own scroll offset. The version this replaces had the list write the
 * shared date on every scroll frame and the strip re-centre itself in an
 * effect — which made every frame of a gesture a *selection*, and a selection
 * reloads both halves of the list and plays the period-step animation. Three
 * separate complaints (the strip lags, a tap on a day is slow, the month title
 * lurches) were that one cause. S04 §7 carries the whole argument.
 *
 * **It is a function of the list, not a reader of its reports.** Nothing here
 * knows what the date is: `scrub.ts` maps an offset to an offset, on the UI
 * thread, and React is not involved in a frame of it. What the strip and the
 * list must never be is two sources of truth about where the reader is — that
 * rule is unchanged, and this is a stronger form of it.
 *
 * **Earliest at the left.** The list above it is reverse-chronological because
 * a ledger is read from the top; that is a rule about a vertical axis, and
 * carried onto a horizontal one it drew a week running backwards next to a
 * `MonthGrid`, on the same screen, running forwards. `ledger-days` sorts the
 * days; `marks` is what tells this component that the two orders are reverses.
 *
 * **Nothing here is measured from a date.** The caller hands over days that
 * are already resolved: the weekday letter localised, the activity classed,
 * the accessible name written. A ribbon that formatted its own dates would
 * need `useT()` and a timezone per cell, sixty times a fling.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Animated, {
  runOnJS,
  type SharedValue,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { horizontalScrollProps } from "../../../primitives/nested-scroll.ts";
import { advance, justSettled, type Settling } from "../../../primitives/scroll-settle.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { type DayActivity, DayCell, type DayDirection } from "../../atoms/day-cell/day-cell";
import { aheadCount, CELL, follow, fracAt, fracFor, nearestCell, offsetWithin } from "./scrub.ts";

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
  /**
   * Past today: drawn quieter, and **more of them are supplied than are
   * drawn**. How many fit is a function of the measured band and is this
   * component's to decide; the screen supplies a ceiling because it is the
   * thing that can localise them.
   */
  ahead?: boolean;
  /** The full date and what happened — what a screen reader hears instead of "14". */
  label: string;
};

export type DayRibbonProps = {
  days: readonly RibbonDay[];
  /**
   * The day the list settled on.
   *
   * **It marks a cell; it does not place the strip.** Placing is the scroll's
   * job now, which is the whole of this rewrite — and the two agree at rest,
   * because the date is written from where the list came to rest.
   */
  current: string | null;
  /** The list's scroll offset, written by the list's own animated handler. */
  scrollY: SharedValue<number>;
  /** Each of the list's anchor points in its content, ascending (`scrub.ts`). */
  tops: SharedValue<readonly number[]>;
  /** The strip cell each of those anchor points stands for. */
  marks: SharedValue<readonly number[]>;
  onPickDay: (date: string) => void;
  /**
   * One light tap as each day passes under the ring, **while a hand is on the
   * strip** (S04 §7).
   *
   * Only then. The same tick fired while the list was being scrolled would
   * buzz forty times through a single fling — a notification where a texture
   * was wanted. Dragging the strip is a picker-like gesture and reads like
   * one; scrolling the ledger is not.
   *
   * Platform-bound, so it arrives as a function: `packages/ui` may not name
   * `expo-haptics` (`architecture/11`), and the web half of the seam is
   * nothing at all. Must be referentially stable — it is called from a worklet.
   */
  onTick?: (() => void) | undefined;
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
 * The days that fit — every loaded day, and as many of the days past today as
 * the measured band has room for.
 *
 * **A band of zero draws none of them**, which is correct rather than cautious:
 * before `onLayout` has answered there is no right answer, and sixteen cells
 * placed against a width of nothing would all be in the same place.
 */
export function cellsFor(days: readonly RibbonDay[], band: number): readonly RibbonDay[] {
  const room = aheadCount(band);
  const out: RibbonDay[] = [];
  let drawn = 0;
  // `days` is earliest-first, so the days past today are the tail of it.
  for (const day of days) {
    if (day.ahead === true) {
      if (drawn >= room) break;
      drawn += 1;
    }
    out.push(day);
  }
  return out;
}

function DayRibbonView({ days, current, scrollY, tops, marks, onPickDay, onTick }: DayRibbonProps) {
  const styles = useStyles();
  const scroller = useAnimatedRef<Animated.ScrollView>();
  /**
   * The band's own width, twice.
   *
   * State because the ring's position and how many days fit are laid out by
   * React; a shared value because the frame callback needs it on the UI thread
   * and reading React state from a worklet is how a worklet comes to hold a
   * number from three renders ago.
   */
  const [band, setBand] = useState(0);
  const width = useSharedValue(0);
  /** Where the strip is drawn, in fractional days. */
  const shown = useSharedValue(0);
  /**
   * A hand is on the strip, so the list does not get to place it.
   *
   * **Inferred from movement, not from `onScrollBeginDrag`.** That event does
   * not fire for a wheel or a trackpad on `react-native-web` — the same gap
   * that makes `onMomentumScrollEnd` useless there (`scroll-settle.ts` says
   * so at length) — so on the web the strip was snapped back to the list's day
   * within a frame of every attempt to browse it, and §7's *the list of dates
   * is scrollable too* was true on a phone and false on two of the three
   * targets that ship. What is true everywhere is that the scroller moved and
   * this component did not move it.
   */
  const detached = useSharedValue(false);
  /** The list offset this has already acted on — what says the list has moved. */
  const seen = useSharedValue(0);
  /**
   * Where the strip's scroller **actually is**, written on every scroll event.
   *
   * **Not the same number as `shown`, and the difference was a real defect.**
   * A `scrollTo` past the content's end is silently clamped, and the strip's
   * content grows as the list pages — so on a cold open the strip asked to
   * centre today, was clamped three cells short because the days past today
   * had not been generated yet, and then never asked again, because `shown`
   * had not changed and the frame callback took that as nothing to do. The
   * ring sat on the 17th over a list showing the 20th for the rest of the
   * session. Comparing against the scroller's own position instead of against
   * the last value computed is what makes a clamp self-correct the moment the
   * room appears.
   */
  const at = useSharedValue(0);
  /** The offset this last asked for — what tells our own move from a hand's. */
  const wrote = useSharedValue(0);
  /** `at` as of the previous frame, so a *movement* can be told from a rest. */
  const was = useSharedValue(0);
  /** The track's full width, so nothing is ever asked for past its end. */
  const content = useSharedValue(0);
  /**
   * Whether the strip has ever been placed.
   *
   * **The first placement is a jump, not a move.** A strip that eased from
   * cell zero to the day the list opened on would animate on arrival — the
   * screen would be seen to scroll itself, which is the one thing a cold open
   * must not do. Every placement after it is the damped follow.
   */
  const placed = useSharedValue(false);
  /** How many cells are drawn, so a snap cannot name one that is not. */
  const count = useSharedValue(0);
  /** The stillness of the strip's *own* scroller — what a snap waits for. */
  const rest = useSharedValue<Settling>({ at: 0, still: 0 });
  /** The cell the tick last fired for, so it fires once per day crossed. */
  const ticked = useSharedValue(-1);
  /** Whether the strip has already been snapped where it now sits. */
  const snapped = useSharedValue(true);

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.width;
      setBand(next);
      width.value = next;
    },
    [width],
  );
  const measureContent = useCallback(
    (contentWidth: number) => {
      content.value = contentWidth;
    },
    [content],
  );

  /**
   * **The strip, placed every frame, entirely on the UI thread.**
   *
   * A frame callback rather than a reaction to `scrollY`: the strip has to keep
   * moving after the list has stopped — that is what catching up from a fling
   * *is* — and a derived value only runs when its input changes. It also gives
   * the real elapsed time, which is what makes the damping frame-rate
   * independent rather than tuned for one device's refresh rate.
   */
  useFrameCallback((frame) => {
    const measured = width.value;
    if (measured <= 0) return;
    // The list moved, so the strip takes orders again (S04 §7). Read before
    // the detached guard: this is the one thing that can clear it.
    const listMoved = scrollY.value !== seen.value;
    if (listMoved) {
      seen.value = scrollY.value;
      detached.value = false;
    }
    // The strip moved, and it was not this callback that moved it — so a hand
    // is on it. Checked as a *movement* rather than as a difference, because a
    // strip resting where it was put differs from `wrote` for ever.
    const drifted = at.value !== was.value;
    was.value = at.value;
    if (drifted && !listMoved) {
      const ours = at.value - wrote.value;
      if (ours > 1 || ours < -1) detached.value = true;
    }
    const elapsed = frame.timeSincePreviousFrame;
    const step = elapsed === null ? 16 : elapsed;

    if (detached.value) {
      /*
        **A hand on the strip, so it snaps and it ticks** (S04 §7).

        The snap is this component's own rather than the scroller's
        `snapToOffsets`. On `react-native-web` that becomes CSS scroll snap,
        which applies to a *programmatic* `scrollTo` as well as to a gesture —
        so the continuous scrub above would snap cell to cell, and the one
        thing this whole rewrite is for is that it does not. Doing it here
        costs a few lines and behaves the same on all three targets.
      */
      const cell = nearestCell(at.value, measured, count.value);
      if (cell !== ticked.value) {
        ticked.value = cell;
        snapped.value = false;
        if (onTick !== undefined) runOnJS(onTick)();
      }
      const before = rest.value;
      const after = advance(before, at.value, step);
      rest.value = after;
      if (!snapped.value && justSettled(before, after)) {
        snapped.value = true;
        shown.value = cell;
        const landing = offsetWithin(cell, measured, content.value);
        wrote.value = landing;
        // Animated, because this one *is* a move the reader should see: it is
        // the strip taking the day they stopped on.
        scrollTo(scroller, landing, 0, true);
      }
      return;
    }
    // Re-armed for the next time a hand arrives, so the first crossing of a
    // new drag ticks rather than being swallowed as "the cell we ended on".
    ticked.value = -1;
    snapped.value = true;

    const target = fracFor(scrollY.value, tops.value, marks.value);
    const next = placed.value ? follow(shown.value, target, step / 1000) : target;
    placed.value = true;
    shown.value = next;
    const want = offsetWithin(next, measured, content.value);
    const gap = want - at.value;
    // Nothing to write is worth not writing: a `scrollTo` per frame on a still
    // strip is a scroll event per frame for the handler below to discard. Half
    // a point, because the scroller reports fractional offsets and exact
    // equality would write one every frame for ever.
    if (gap < 0.5 && gap > -0.5) return;
    wrote.value = want;
    scrollTo(scroller, want, 0, false);
  });

  /**
   * A hand on the strip.
   *
   * `onScroll` fires for this component's own `scrollTo` as well, which is why
   * it writes nothing unless a drag has claimed the strip — and why the claim
   * is made on `onBeginDrag`, the one event a programmatic scroll cannot raise.
   * Tracking `shown` while detached is what lets the re-attach spring from the
   * day the reader actually left it on rather than from where the list was.
   */
  const handleStripScroll = useAnimatedScrollHandler(
    {
      onBeginDrag: () => {
        detached.value = true;
      },
      onScroll: (event) => {
        // Always: this is where the strip *is*, whoever moved it, and the
        // frame callback compares against it to notice a clamped `scrollTo`.
        at.value = event.contentOffset.x;
        if (!detached.value) return;
        shown.value = fracAt(event.contentOffset.x, width.value);
      },
    },
    [at, detached, shown, width],
  );

  const cells = useMemo(() => cellsFor(days, band), [days, band]);
  useEffect(() => {
    count.value = cells.length;
  }, [cells.length, count]);
  // The ring sits in the middle of the band, always. Computed rather than
  // centred by layout because it is drawn over a scroller, not in it.
  const ring = useMemo(() => [styles.ring, { left: band / 2 - CELL / 2 }], [styles.ring, band]);

  return (
    <View style={styles.frame}>
      <Animated.ScrollView
        ref={scroller}
        onLayout={measure}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleStripScroll}
        onContentSizeChange={measureContent}
        // 16ms: the strip is placed from this and the default reports once per
        // gesture — a strip that only knows where it was dragged to when the
        // finger lifts.
        scrollEventThrottle={16}
        // A bounded scroller inside a page that scrolls the other way: it must
        // contain its own overscroll or a fling along it drags the list behind.
        {...horizontalScrollProps(styles.band)}
        contentContainerStyle={styles.track}
        // A ribbon is a run of days, not a list of controls to tab through one
        // by one — a keyboard reader reaches a date through the picker, which
        // is a grid and says so.
        accessibilityRole="list"
      >
        {cells.map((day) => (
          <MemoRibbonCell
            key={day.date}
            day={day}
            current={day.date === current}
            onPickDay={onPickDay}
          />
        ))}
      </Animated.ScrollView>
      {/*
        **Drawn over the strip and after it, so it is never under a cell.**
        `pointerEvents="none"` because it is a mark, not a target: the cell
        under it is still the thing a finger lands on. Nothing is drawn before
        the band is measured — a ring at `-24` is worse than no ring.
      */}
      {band > 0 ? <View pointerEvents="none" style={ring} /> : null}
    </View>
  );
}

export const DayRibbon = memo(DayRibbonView);

const useStyles = makeStyles((theme) => ({
  /** The positioning context the ring is placed in, and nothing else. */
  frame: { position: "relative" },
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
  /**
   * The permanent mark: an accent edge around the middle of the band.
   *
   * A ring rather than a fill. The fill is `today`'s, and a second filled cell
   * would be two cells claiming the same kind of importance — where these two
   * say different things: one is the day you are on, the other is the day it
   * is. They coincide on a cold open, and the ring over the fill reads as one
   * strong marker rather than as a conflict.
   */
  ring: {
    position: "absolute",
    top: space.sm,
    width: CELL,
    height: 66,
    borderWidth: 2,
    borderColor: theme.accent,
    borderRadius: radius.md,
  },
}));

export type { DayActivity, DayDirection };
