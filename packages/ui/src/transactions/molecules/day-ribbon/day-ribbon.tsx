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

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { type LayoutChangeEvent, type ListRenderItemInfo, View } from "react-native";
import type { FrameInfo } from "react-native-reanimated";
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
import {
  advance,
  justSettled,
  LIFTED,
  SETTLE_MS,
  type Settling,
  UNREAD,
} from "../../../primitives/scroll-settle.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { type DayActivity, DayCell, type DayDirection } from "../../atoms/day-cell/day-cell";
import {
  arrivedAt,
  type Grip,
  grip,
  LAND_MS,
  LOOSE,
  leadsNow,
  letGo,
  RESEAT_CELLS,
  relandsNow,
  snapsNow,
  takeHold,
  ticksNow,
} from "./grip.ts";
import {
  aheadCount,
  CELL,
  follow,
  fracAt,
  fracFor,
  GAP,
  markOf,
  nearestCell,
  offsetWithin,
  SEEN_LEAD,
  STRIDE,
  type StripPlacement,
  trackLead,
  trackWidth,
} from "./scrub.ts";

/** How long the list is given to start moving before a lead is called finished. */
const LEAD_GRACE_MS = 1000;
/** Cells drawn before the first scroll: a band and a half on the widest phone. */
const INITIAL_CELLS = 16;
/** The render window, in bands. Wide, for a flick (see the list below). */
const WINDOW_BANDS = 9;

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
  /**
   * This cell was invented to fill the band, so it is one the strip may drop.
   *
   * **Not `ahead`.** Every day after today is drawn quieter; only the ones the
   * ledger never had are expendable. Counting the budget by `ahead` took a
   * real transaction dated next week off the strip, and every cell after it.
   */
  generated?: boolean;
  /** The full date and what happened — what a screen reader hears instead of "14". */
  label: string;
};

export type DayRibbonProps = {
  /**
   * How many days the run holds, and the day each cell stands for.
   *
   * **A count and a lookup, not an array** — the run is ten years long
   * (`ledger-days.ts`'s `ribbonRun`) and the strip is virtualised, so a day is
   * asked for when its cell is drawn and at no other time. `dayAt` must answer
   * for cells *past* `count` when `fill` is set: those are the days drawn to
   * carry the run to the band's right-hand edge.
   */
  count: number;
  dayAt: (cell: number) => RibbonDay;
  /** Whether the run continues past `count` far enough to fill the band. */
  fill: boolean;
  /** The cell the strip opens on, so the first window drawn is the right one. */
  start: number;
  current: string | null;
  /** The list's scroll offset, written by the list's own animated handler. */
  scrollY: SharedValue<number>;
  /**
   * Where each of the list's day blocks sits and which cell it is
   * (`list-geometry.ts`).
   *
   * **One value, because the two arrays are read together every frame.**
   * Written as two assignments, a frame landing between them placed the strip
   * from one list's positions and another's cells.
   */
  placement: SharedValue<StripPlacement>;
  onPickDay: (date: string) => void;
  /**
   * The strip was left on this cell by hand, and the list should come to it
   * (S04 §7). Asked once per rest, after `grip.ts`'s `LEAD_MS`.
   */
  onLead?: (cell: number) => void;
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
/**
 * The day the list is on, for the cells — **beside the list rather than
 * through it, and heard only by the cells it concerns.**
 *
 * Handed down in `renderItem` it re-made that function on every settle, and a
 * virtualised list re-renders every cell wrapper it holds when `renderItem`
 * changes: forty-eight of them per stop, to move one highlight
 * (`tools/e2e`'s `renders.spec.ts` is what noticed). A plain context would
 * reach the cells and still wake all of them. Each cell instead subscribes to
 * one boolean — *is it me?* — so a settle re-renders the day that lost the
 * mark and the day that gained it, and nothing else.
 */
type CurrentDayStore = {
  read: () => string | null;
  write: (date: string | null) => void;
  subscribe: (heard: () => void) => () => void;
};

function currentDayStore(initial: string | null): CurrentDayStore {
  let value = initial;
  const hearers = new Set<() => void>();
  return {
    read: () => value,
    write: (date) => {
      if (date === value) return;
      value = date;
      for (const heard of hearers) heard();
    },
    subscribe: (heard) => {
      hearers.add(heard);
      return () => {
        hearers.delete(heard);
      };
    },
  };
}

const CurrentDay = createContext<CurrentDayStore>(currentDayStore(null));

function RibbonCell({ day, onPickDay }: { day: RibbonDay; onPickDay: (date: string) => void }) {
  const date = day.date;
  const store = useContext(CurrentDay);
  const isCurrent = useCallback(() => store.read() === date, [store, date]);
  const current = useSyncExternalStore(store.subscribe, isCurrent, isCurrent);
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

/** The cells, as the list wants them: their own indices. */
function indices(total: number): readonly number[] {
  return Array.from({ length: total }, (_, cell) => cell);
}

const keyOf = (cell: number): string => String(cell);

/** Fixed cells, so the list never measures one — and can open anywhere. */
const layoutOf = (
  _data: ArrayLike<number> | null | undefined,
  index: number,
): { length: number; offset: number; index: number } => ({
  length: STRIDE,
  offset: STRIDE * index,
  index,
});

/**
 * The first cell of the first window drawn.
 *
 * **Half a window before the day the strip opens on**, because the ring is in
 * the middle of the band: opened *on* that day, the list draws it and the days
 * after it, and the half of the band to its left is blank track until the
 * first scroll event widens the window.
 */
export function opensOn(start: number, total: number): number {
  if (total <= 0) return 0;
  const first = start - INITIAL_CELLS / 2;
  const last = total - 1;
  return first < 0 ? 0 : first > last ? last : first;
}

function Gap() {
  return <View style={GAP_STYLE} />;
}
const GAP_STYLE = { width: GAP };

/**
 * The strip itself — **everything but the day the list is on.** That one prop
 * changes on every settle, and a list that takes it re-renders every wrapper
 * it holds to move one highlight; so the strip below never sees it, and
 * `DayRibbonView` hands it to the cells directly (`CurrentDay`).
 */
function StripView({
  count: held,
  dayAt,
  fill,
  start,
  scrollY,
  placement,
  onPickDay,
  onLead,
  onTick,
}: Omit<DayRibbonProps, "current">) {
  const styles = useStyles();
  const scroller = useAnimatedRef<Animated.FlatList<number>>();
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
  /** The offset this last asked for. */
  const wrote = useSharedValue(0);
  /** Milliseconds since this last wrote to the scroller — `grip.ts`'s `QUIET_MS`. */
  const sinceWrite = useSharedValue(0);
  /** Milliseconds since the last tap, for the floor between two. */
  const sinceTick = useSharedValue(1000);
  /** `at` as of the previous frame, so a *movement* can be told from a rest. */
  const was = useSharedValue(0);
  /** Whether the list was already moving last frame — a glide, not a new act. */
  const gliding = useSharedValue(false);
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
  const rest = useSharedValue<Settling>(UNREAD);
  /** The day the list was on last frame, so the target's speed can be measured. */
  const aimed = useSharedValue(0);
  /** The stillness of the *list*, which is what decides when the strip lands. */
  const listRest = useSharedValue<Settling>(UNREAD);
  /** The cell the strip is landing on, or `-1` while the list is moving. */
  const landing = useSharedValue(-1);
  /**
   * Who is driving the strip — `grip.ts`, where the rule is and where it is
   * tested. Three reviews found three bugs in this one decision, every one of
   * them invisible from here: a frame callback has no test that can see it.
   */
  const hold = useSharedValue<Grip>(LOOSE);
  /** The cell the tick last fired for, so it fires once per day crossed. */
  const ticked = useSharedValue(-1);
  /** Whether the strip has already been snapped where it now sits. */
  const snapped = useSharedValue(true);
  /** The cell nearest the ring last frame — what re-arms the snap. */
  const nearest = useSharedValue(-1);
  /** Where the ring was over the strip last frame, in fractional days. */
  const under = useSharedValue(Number.NaN);
  /** The cell the list was last sent to from here, so one rest is one instruction. */
  const told = useSharedValue(-1);
  /**
   * The list is on its way to a day this strip chose. **Its movement is then
   * not the reader taking the list back**: re-attached at the first frame, the
   * strip sprang to wherever the list still was and rode back with it.
   */
  const leading = useSharedValue(false);
  const sinceLead = useSharedValue(0);
  /** Where the strip sat when it was last re-sent home, so it is asked once. */
  const stuck = useSharedValue(Number.NaN);
  /** A re-seat in flight: cells swept over are not days going past (`grip.ts`). */
  const muted = useSharedValue(true);

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.width;
      setBand(next);
      width.value = next;
    },
    [width],
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
  const place = useCallback(
    (frame: FrameInfo) => {
      "worklet";
      const measured = width.value;
      if (measured <= 0) return;
      // The list moved, so the strip takes orders again (S04 §7). Read before
      // the detached guard: this is the one thing that can clear it.
      /*
      **A hand on the strip, inferred — and the two ways that inference was
      wrong.**

      It was *the strip moved and the list did not*. Both halves failed.

      The strip also moves when a `scrollTo` is **clamped** by the scroller —
      so nothing is asked for past the track's end (`scrub.ts`'s `trackWidth`,
      arithmetic rather than a measurement that arrives late or not at all),
      and a strip moved by this component's own write is never read as a hand
      (`grip.ts`'s `QUIET_MS`).

      And the list is still gliding for a while after a fling, so a hand
      arriving during the glide was overruled every frame: the drift check was
      skipped whenever the list had moved, and the list had moved. A detach now
      survives a list *movement* and is cleared by a list *gesture* — which is
      what §7 means by the thing you touch winning.
    */
      const listMoved = scrollY.value !== seen.value;
      const listJumped = listMoved && !gliding.value;
      seen.value = scrollY.value;
      gliding.value = listMoved;
      /*
        **A finger on the strip outranks the list, and the list moves anyway.**
        The strip is a horizontal scroller inside a page that scrolls
        vertically, so a real thumb drag along it moves the list by a point or
        two as well — and without the guard that counted as the reader taking
        the list back, cleared the detach mid-gesture, and threw the strip to
        the day the list is on. On a phone: drag from the 20th toward the 16th
        and the strip snaps home to the 20th under your thumb.
      */
      const elapsed = frame.timeSincePreviousFrame;
      const step = elapsed === null ? 16 : elapsed;
      const drifted = at.value !== was.value;
      was.value = at.value;
      sinceWrite.value += step;
      sinceTick.value += step;
      sinceLead.value += step;
      if (leading.value && sinceLead.value > LEAD_GRACE_MS && !listMoved && !gliding.value) {
        // The list has arrived (or never had to move): the strip is its again,
        // and already on the day it will be asked to land on.
        leading.value = false;
        hold.value = LOOSE;
        told.value = -1;
      }
      hold.value = grip(hold.value, {
        listJumped: listJumped && !leading.value,
        drifted,
        sinceWrite: sinceWrite.value,
      });

      /*
        **The tick, read off where the strip actually is** (S04 §7) — one rule
        for a thumb, a coast, the list's scrub and a landing, because all four
        end the same way: a day's centre under the ring. `at` rather than the
        value last asked for, so the tap is felt when the day is *seen* to
        arrive, which on a device is a frame or two after the write.
      */
      const ringAt = fracAt(at.value, measured);
      const arrived = arrivedAt(under.value, ringAt);
      under.value = ringAt;
      if (muted.value && placed.value && (listMoved || sinceWrite.value >= LAND_MS)) {
        muted.value = false;
      }
      if (ticked.value < 0 || muted.value) {
        // Seeded, not ticked: the day already under the ring was not reached.
        ticked.value = Math.round(ringAt);
      } else if (arrived >= 0 && arrived !== ticked.value) {
        ticked.value = arrived;
        if (ticksNow(hold.value, sinceTick.value) && onTick !== undefined) {
          sinceTick.value = 0;
          runOnJS(onTick)();
        }
      }

      if (hold.value.detached) {
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
        if (cell !== nearest.value) {
          nearest.value = cell;
          snapped.value = false;
        }
        /*
          **The snap waits for the finger to leave.** Measured while it was
          still down, a pause mid-drag was a settle: the strip animated itself
          to the nearest cell while the thumb was still moving, which reads as
          the strip jumping somewhere of its own accord — the 10th, on the way
          from the 20th to the 16th. `rest` is reset when the gesture begins
          and ends, so stillness is counted from the lift.
        */
        const before = rest.value;
        const after = advance(before, at.value, step);
        rest.value = after;
        if (snapsNow(hold.value, justSettled(before, after), snapped.value)) {
          snapped.value = true;
          shown.value = cell;
          const landing = offsetWithin(cell, measured, trackWidth(measured, count.value));
          wrote.value = landing;
          sinceWrite.value = 0;
          // Animated, because this one *is* a move the reader should see: it is
          // the strip taking the day they stopped on.
          scrollTo(scroller, landing, 0, true);
        }
        if (
          onLead !== undefined &&
          !leading.value &&
          leadsNow(hold.value, snapped.value, after.still, cell, told.value)
        ) {
          told.value = cell;
          leading.value = true;
          sinceLead.value = 0;
          runOnJS(onLead)(cell);
        }
        return;
      }
      const here = placement.value;
      // **Read at the line the reader is looking at, not at the top edge** —
      // `SEEN_LEAD` below it, the same line `blockAt` names the day by, so the
      // ring in motion and the ring at rest are about the same place.
      //
      // **Only while the list is actually moving.** The line in motion and the
      // rule at rest differ by a fraction of a cell, and on a list that has
      // never moved that fraction was read as *a day going past*: the strip
      // ticked once on every cold open, and drifted off the day for the 140ms
      // before it landed back on it. Found by the first spec to run this in a
      // browser with frames (`visual/day-ribbon.spec.ts`).
      const target = listRest.value.moved
        ? fracFor(scrollY.value + SEEN_LEAD, here.tops, here.marks)
        : markOf(scrollY.value, here.tops, here.marks);
      // How fast the day being followed is moving, in cells per second — the one
      // thing `follow` cannot work out for itself, and the thing its damping is
      // decided by. Measured rather than inferred from the gap, because a gap is
      // a function of the frame interval and a speed is not.
      const speed = step > 0 ? ((target - aimed.value) * 1000) / step : 0;
      aimed.value = target;

      /*
      **When the list stops, the strip lands on the day the list reports.**

      The ring is continuous, so at rest it sits wherever the scroll stopped
      and the cell under it is the *nearest* one — while the date written by
      the settle is the day whose rows are on screen, which is the block the
      offset is inside. Past a block's midpoint those are different days, and
      the screen showed a ring on one and Calendar marked on the next: two
      sources of truth about where the reader is, found by the e2e spec the
      first time it ran.

      `markOf` is the same rule `dayAt` uses, so the two agree by construction.
      The land is animated for the same reason the hand-snap is: it is the last
      fraction of a cell and the reader should see it happen.
    */
      const beforeRest = listRest.value;
      const afterRest = advance(beforeRest, scrollY.value, step);
      listRest.value = afterRest;
      if (listMoved) landing.value = -1;
      /*
      **A state, not a crossing.** The cell a day stands for can change
      under a strip at rest — under a search the strip is the matched days,
      and the run's origin moves after a jump behind it — and a land latched
      once, on the crossing, then meant a different day: the e2e spec caught
      the ring a day *past* Calendar, having fixed it being a day behind.
      Recomputed while at rest, the land follows the re-index.
    */
      if (afterRest.still >= SETTLE_MS) {
        const cell = markOf(scrollY.value, here.tops, here.marks);
        const home = offsetWithin(cell, measured, trackWidth(measured, count.value));
        // Sent once per day landed on — and again if it never got there, which
        // on a device it sometimes does not (`grip.ts`'s `relandsNow`).
        const again = at.value !== stuck.value && relandsNow(home - at.value, sinceWrite.value);
        if (cell !== landing.value || again) {
          // Sent again once per place it is stuck: a strip a re-send did not
          // move is against its own end, and asking for ever is a write a frame.
          stuck.value = again ? at.value : Number.NaN;
          landing.value = cell;
          shown.value = cell;
          const reach = cell - ringAt;
          if (reach > RESEAT_CELLS || reach < -RESEAT_CELLS) muted.value = true;
          wrote.value = home;
          sinceWrite.value = 0;
          // Animated: it is the last fraction of a cell, and the reader should
          // see the strip take the day rather than find it already there. The
          // tick is its arrival, above — not this write.
          scrollTo(scroller, home, 0, true);
        }
        return;
      }
      // The first placement is where the strip will *rest* — the day's own
      // cell — rather than the moving line, or a cold open lands twice.
      const next = placed.value
        ? follow(shown.value, target, speed, step / 1000)
        : markOf(scrollY.value, here.tops, here.marks);

      // The first placement is a re-seat: it lands in silence.
      if (!placed.value) muted.value = true;
      placed.value = true;
      shown.value = next;
      const want = offsetWithin(next, measured, trackWidth(measured, count.value));
      const gap = want - at.value;
      // Nothing to write is worth not writing: a `scrollTo` per frame on a still
      // strip is a scroll event per frame for the handler below to discard. Half
      // a point, because the scroller reports fractional offsets and exact
      // equality would write one every frame for ever.
      if (gap < 0.5 && gap > -0.5) return;
      wrote.value = want;
      sinceWrite.value = 0;
      scrollTo(scroller, want, 0, false);
    },
    [
      at,
      aimed,
      count,
      gliding,
      hold,
      landing,
      leading,
      listRest,
      muted,
      nearest,
      onLead,
      onTick,
      placed,
      placement,
      rest,
      scroller,
      scrollY,
      seen,
      shown,
      sinceLead,
      sinceTick,
      sinceWrite,
      snapped,
      stuck,
      ticked,
      told,
      under,
      was,
      width,
      wrote,
    ],
  );
  /**
   * **Memoised, for the reason `use-scroll-settle.ts` sets out at length.**
   * `useFrameCallback` re-registers on the callback's identity, and the
   * worklets plugin builds a fresh function per evaluation — so an inline
   * arrow tore this down and put it back on every render. This component's
   * props churn on every settle and every page load, which is precisely when a
   * re-register drops strip frames: the registry's `startTime` is reset, and
   * emptying the active set restarts the `requestAnimationFrame` loop.
   */
  useFrameCallback(place);

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
        hold.value = takeHold();
        leading.value = false;
        // Stillness is measured from the lift, not through the gesture.
        rest.value = UNREAD;
        /*
          **Seeded with the day already under the ring.** Left at *unknown*,
          the opening crossing of every drag had nothing to compare against and
          was swallowed — and on a drag of one day that is the whole of the
          feedback, which is what "no haptics" turned out to mean.
        */
        ticked.value = nearestCell(at.value, width.value, count.value);
      },
      onEndDrag: () => {
        hold.value = letGo(hold.value);
        // Already moved — the drag *was* the movement — so a finger lifted
        // without a flick still settles, and snaps.
        rest.value = LIFTED;
      },
      onScroll: (event) => {
        // Always: this is where the strip *is*, whoever moved it, and the
        // frame callback compares against it to notice a clamped `scrollTo`.
        at.value = event.contentOffset.x;
        if (!hold.value.detached) return;
        shown.value = fracAt(event.contentOffset.x, width.value);
      },
    },
    [at, count, hold, rest, shown, ticked, width],
  );

  const total = held + (fill ? aheadCount(band) : 0);
  const cells = useMemo(() => indices(total), [total]);
  // Both ends, so every cell can reach the ring — see `trackLead`.
  const track = useMemo(() => ({ paddingHorizontal: trackLead(band) }), [band]);
  useEffect(() => {
    count.value = total;
  }, [total, count]);
  const renderCell = useCallback(
    ({ item }: ListRenderItemInfo<number>) => {
      return <MemoRibbonCell day={dayAt(item)} onPickDay={onPickDay} />;
    },
    [dayAt, onPickDay],
  );
  // The ring sits in the middle of the band, always. Computed rather than
  // centred by layout because it is drawn over a scroller, not in it.
  const ring = useMemo(() => [styles.ring, { left: band / 2 - CELL / 2 }], [styles.ring, band]);

  return (
    <View style={styles.frame}>
      {/*
        **A virtualised list, because the run is ten years long** and a dozen
        cells of it are ever on screen. Fixed cells (`layoutOf`) are what let
        it open on `start` without drawing its way there, and the window is
        wide because a flick along the strip covers a month in a breath — a
        narrow one shows blank track under the ring.
      */}
      <Animated.FlatList
        ref={scroller}
        data={cells}
        renderItem={renderCell}
        keyExtractor={keyOf}
        getItemLayout={layoutOf}
        ItemSeparatorComponent={Gap}
        initialScrollIndex={opensOn(start, total)}
        initialNumToRender={INITIAL_CELLS}
        windowSize={WINDOW_BANDS}
        maxToRenderPerBatch={INITIAL_CELLS}
        onLayout={measure}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleStripScroll}
        // 16ms: the strip is placed from this and the default reports once per
        // gesture — a strip that only knows where it was dragged to when the
        // finger lifts.
        scrollEventThrottle={16}
        // A bounded scroller inside a page that scrolls the other way: it must
        // contain its own overscroll or a fling along it drags the list behind.
        {...horizontalScrollProps(styles.band)}
        contentContainerStyle={track}
        // A ribbon is a run of days, not a list of controls to tab through one
        // by one — a keyboard reader reaches a date through the picker, which
        // is a grid and says so.
        accessibilityRole="list"
      />
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

const Strip = memo(StripView);

function DayRibbonView({ current, ...strip }: DayRibbonProps) {
  // Made once with the day it opens on, so the first paint is already marked.
  const [currentDay] = useState(() => currentDayStore(current));
  useEffect(() => currentDay.write(current), [currentDay, current]);
  return (
    <CurrentDay.Provider value={currentDay}>
      <Strip {...strip} />
    </CurrentDay.Provider>
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
  /**
   * **The gap is `GAP`, and the padding is not here.** Either end is inset by
   * `trackLead(band)` so the first and last cells can reach the middle of the
   * band — a measured number, applied in the component.
   */

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
