/**
 * `<Wheel>` — `design-system/03` §3.7a. A value picked by rolling.
 *
 * Five rows tall, `touchTarget.min` each, the middle one banded. The list
 * snaps to that band and the banded row *is* the value — there is no second
 * place a reader could look for it.
 *
 * **One column, and it knows nothing about dates.** A day, a month, an hour
 * and a year are four cycles with four different lengths and two different
 * wrapping rules; a component that knew about any of them would know about all
 * of them. This takes `options` and reports an index, and `DatePicker` is
 * where the calendar lives.
 *
 * **A cycle wraps; a scale does not** (§3.7a). `wraps` draws the options three
 * times and returns to the middle copy once the flick settles — snapping
 * suspended for that one frame, so the value under the band never moves. Hours
 * and minutes take it; days, months and years do not, because a year is not a
 * cycle and a wheel that wraps one lets a reader spin into 1970 by accident.
 *
 * **It re-renders once per row crossed, not once per frame.** The fade by
 * distance needs the live index, and `onScroll` delivers one every frame —
 * so the handler rounds to a row and sets state only when that row changes.
 * `wheel.test.tsx` pins the count, because the cheap version of this is a
 * component that re-renders sixty times a second while a thumb is down.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { ScrollView, Text, View } from "react-native";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { useHaptics } from "../../haptics";
import { useInteraction } from "../../interaction.ts";
import { nestedScrollProps } from "../../nested-scroll.ts";
import { PressableScaled } from "../pressable-scaled/pressable-scaled";

/** One row, and the height every measurement here is a multiple of. */
export const WHEEL_ROW = touchTarget.min;

/** Rows visible at once. Two either side of the band, which is §3.7a's face. */
const VISIBLE = 5;

/** How long the drum must be still before it counts as rested, in ms. */
const REST = 120;

/**
 * How long a lifted finger is given to turn into a coast before the drum is
 * called still. A flick raises `onMomentumScrollBegin` within a frame or two;
 * a finger lifted with no flick raises nothing more at all.
 */
const LIFT_GRACE = 80;

/** How far a row is from the band, clamped to the classes that exist. */
const NEAR = 1;
const MID = 2;
/**
 * Every row further out than `MID`, as one class. **Clamped before it is a
 * prop**: the raw distance of every row changes on every row crossed — 1926 is
 * a hundred rows from 2026 and a hundred and one from 2027 — so an unclamped
 * prop re-rendered the whole column through `Row`'s memo.
 */
const FAR = 3;

/**
 * Which option a scroll offset is resting on.
 *
 * Exported as arithmetic, and tested as arithmetic: the value is only
 * *reported* on momentum-end, which `react-native-web` synthesises from real
 * scrolling and jsdom cannot produce. A test that went through the component
 * could assert the fade and never the answer.
 */
export function rowAt(offsetY: number, length: number): number {
  const at = Math.round(offsetY / WHEEL_ROW);
  return ((at % length) + length) % length;
}

/**
 * Where a wrapping wheel must jump back to, or `null` when it is already in
 * the middle copy. The offset is deliberately *identical* in value to where it
 * sits, so returning is invisible.
 */
export function recentreTo(offsetY: number, length: number): number | null {
  const at = Math.round(offsetY / WHEEL_ROW);
  if (at >= length && at < length * 2) return null;
  return (rowAt(offsetY, length) + length) * WHEEL_ROW;
}

export type WheelOption = {
  /** Stable across renders — the value reported to `onChange`. */
  value: string;
  /** What the row reads. Already localised. */
  label: string;
};

export type WheelProps = {
  /** The column's accessible name: "Day", "Month", "Hour". */
  label: string;
  options: readonly WheelOption[];
  value: string;
  onChange: (value: string) => void;
  /** §3.7a — a cycle wraps, a scale does not. */
  wraps?: boolean;
  /** The column's own width. §3.7a sizes each to the widest thing in it. */
  width: number;
};

export function Wheel({ label, options, value, onChange, wraps = false, width }: WheelProps) {
  const styles = useStyles();
  const scroller = useRef<ScrollView>(null);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [row, setRow] = useState(selected);

  // Three copies when it wraps, so there is a neighbour in both directions at
  // every position. The middle copy is where it sits.
  const copies = wraps ? 3 : 1;
  const offset = wraps ? options.length : 0;
  const drawn = useMemo(() => {
    const rows: WheelOption[] = [];
    for (let copy = 0; copy < copies; copy += 1) rows.push(...options);
    return rows;
  }, [copies, options]);

  const settle = useRef(false);

  // The value can change from outside — a relative chip, a form reset — and
  // the wheel has to follow it. Only when it disagrees with where the drum
  // already is, or every settled scroll would fight the animation it caused.
  const opened = useRef(false);

  // **Before paint, not after it.** As a plain effect the drum was painted once
  // at its first option and then moved: a flash of the wrong rows on open, and
  // a screenshot that caught it about one run in five.
  useLayoutEffect(() => {
    if (settle.current) {
      settle.current = false;
      return;
    }
    setRow(selected);
    // **A picker opens already showing its value.** `contentOffset` places it
    // on native; `react-native-web` ignores that prop, so without this the
    // drum mounts at its first option and rolls to the value in front of the
    // reader — which reads as the control changing their answer. Only a
    // *later* change animates, because then something really is moving.
    scroller.current?.scrollTo({
      y: (selected + offset) * WHEEL_ROW,
      animated: opened.current,
    });
    opened.current = true;
  }, [selected, offset]);

  /** Whether the drum is coasting — between a flick and its natural stop. */
  const coasting = useRef(false);
  /** Whether a hand moved it, as opposed to a chip or a pressed row. */
  const handled = useRef(false);

  /*
    **Placed again once it has a size.** Inside a sheet the drum mounts before
    the sheet has laid it out, and a `scrollTo` on a scroller with no height is
    clamped to zero and forgotten — the drum then opened on its first option,
    some of the time. Layout is the first moment the placement can hold.
  */
  const placeOnLayout = useCallback(() => {
    if (handled.current || coasting.current) return;
    scroller.current?.scrollTo({ y: (selected + offset) * WHEEL_ROW, animated: false });
  }, [selected, offset]);

  const settleAt = useCallback(
    (offsetY: number) => {
      const picked = options[rowAt(offsetY, options.length)];
      if (picked === undefined) return;

      /*
        **On a row, always — the drum's own guarantee, not the platform's.**
        `snapToInterval` is a request: it is dropped when anything interrupts
        the deceleration, and on an iPhone the minutes came to rest half a row
        off the band. So a drum that has stopped between two rows is put on
        the nearer one, and a wrapping drum is taken back to its middle copy
        in the same move — the value under the band is identical, so nothing
        appears to change.
      */
      const aligned = Math.round(offsetY / WHEEL_ROW) * WHEEL_ROW;
      const home = wraps ? recentreTo(aligned, options.length) : null;
      if (home !== null) scroller.current?.scrollTo({ y: home, animated: false });
      else if (Math.abs(aligned - offsetY) > 0.5) {
        scroller.current?.scrollTo({ y: aligned, animated: true });
      }
      if (picked.value !== value) {
        settle.current = true;
        onChange(picked.value);
      }
    },
    [onChange, options, value, wraps],
  );

  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  /**
   * The last offset the drum actually reported.
   *
   * **The end-of-scroll events carry no offset on the web.** `react-native-web`
   * fires `onScrollEndDrag` and `onMomentumScrollEnd` with a synthetic event
   * whose `contentOffset` is absent, so reading it there gives `NaN`, lands on
   * no option, and returns — while having already cancelled the timer that
   * would have settled correctly. Measured in Chrome: the drum moved four
   * rows, the fade followed, and the value never changed. Every settle path
   * therefore reads the offset from here.
   */
  const at = useRef(selected * WHEEL_ROW);

  const handleSettled = useCallback(() => {
    clearTimeout(idle.current);
    coasting.current = false;
    handled.current = false;
    settleAt(at.current);
  }, [settleAt]);

  /*
    **A lift is not a stop.** `onScrollEndDrag` fires the instant the finger
    leaves, with the whole coast still to come — and settling there moved the
    drum to its middle copy *mid-flight*, which cancels the deceleration and
    with it the snap. The lift now waits to see whether a coast begins, and a
    coast is settled where it ends.
  */
  const handleLift = useCallback(() => {
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (!coasting.current) handleSettled();
    }, LIFT_GRACE);
  }, [handleSettled]);
  const handleCoastBegin = useCallback(() => {
    coasting.current = true;
    clearTimeout(idle.current);
  }, []);
  const handleTouch = useCallback(() => {
    handled.current = true;
  }, []);

  const { tick } = useHaptics();

  useEffect(() => () => clearTimeout(idle.current), []);

  /**
   * **The settle is this component's own, not the platform's.**
   *
   * `onMomentumScrollEnd` is the obvious hook and it does not fire on the web
   * for a scroll driven by a wheel or a trackpad — measured in Chrome, where
   * the drum moved exactly four rows and reported nothing. A control whose
   * value depends on a gesture one platform never synthesises is a control
   * that silently does not work there, so the rest after a roll is timed here,
   * and the platform's own events only make it prompt where they do fire.
   */
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      at.current = offsetY;
      const index = rowAt(offsetY, options.length);
      setRow((current) => {
        if (current === index) return current;
        // One tick per row that passes the band — under a hand only. A chip or
        // a pressed row rolls the drum through a dozen rows to get somewhere,
        // and that is a move, not a dozen choices.
        if (handled.current) tick();
        return index;
      });
      clearTimeout(idle.current);
      // The timer is the web's settle, where no momentum event ever fires. A
      // coasting drum is still reporting offsets and is not idle.
      if (!coasting.current) idle.current = setTimeout(handleSettled, REST);
    },
    [handleSettled, options.length, tick],
  );

  return (
    <View style={[styles.column, { width }]}>
      <ScrollView
        ref={scroller}
        accessibilityLabel={label}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ROW}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onLayout={placeOnLayout}
        onContentSizeChange={placeOnLayout}
        onScrollBeginDrag={handleTouch}
        onScrollEndDrag={handleLift}
        onMomentumScrollBegin={handleCoastBegin}
        onMomentumScrollEnd={handleSettled}
        contentContainerStyle={styles.content}
        contentOffset={{ x: 0, y: (selected + offset) * WHEEL_ROW }}
        // A bounded vertical scroller inside a sheet: a roll that reaches the
        // end of the drum must not hand the rest of the gesture to the sheet
        // and dismiss it.
        {...nestedScrollProps(undefined)}
      >
        {drawn.map((option, index) => (
          <Row
            key={`${option.value}-${Math.floor(index / options.length)}`}
            label={option.label}
            value={option.value}
            distance={Math.min(Math.abs((index % options.length) - row), FAR)}
            // One copy speaks: a wrapping drum draws every option three times,
            // and a screen reader should hear *March* once.
            spoken={Math.floor(index / options.length) === (wraps ? 1 : 0)}
            onPick={onChange}
          />
        ))}
      </ScrollView>
    </View>
  );
}

type RowProps = {
  label: string;
  value: string;
  distance: number;
  spoken: boolean;
  onPick: (value: string) => void;
};

/**
 * Its own **memoised** component so a row re-renders only when its own
 * distance changes — crossing one row restyles three of them, not every row.
 *
 * The memo is what makes a long column cheap. Unmemoised, every row crossed
 * re-rendered the whole column — tolerable at thirty-one days, and not at the
 * year column's two hundred and one rows or the minutes' hundred and eighty.
 * The props are all primitives or the caller's stable `onChange`, so the
 * default comparison is the right one.
 *
 * **A row can be pressed, and that is the drum's only way in without a
 * scroll.** Rolling was the whole interface: nothing for a screen reader or a
 * switch to operate, and no way to take the neighbour a reader can see except
 * by nudging the drum onto it. A press picks the row; the drum follows the
 * value the way it follows a chip.
 */
const Row = memo(function Row({ label, value, distance, spoken, onPick }: RowProps) {
  const styles = useStyles();
  const handlePress = useCallback(() => onPick(value), [onPick, value]);
  const { focused, handlers } = useInteraction();
  const chosen = distance === 0;
  return (
    <PressableScaled
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen }}
      aria-selected={chosen}
      {...(spoken ? {} : UNSPOKEN)}
      onPress={handlePress}
      {...handlers}
      style={[styles.row, focused ? styles.rowFocused : null]}
    >
      <Text
        style={[
          styles.option,
          distance === 0
            ? styles.selected
            : distance === NEAR
              ? styles.near
              : distance === MID
                ? styles.mid
                : styles.far,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableScaled>
  );
});

/** The outer copies of a wrapping drum: drawn, pressable, and not read out. */
const UNSPOKEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  "aria-hidden": true,
} as const;

const useStyles = makeStyles((theme) => ({
  column: { height: WHEEL_ROW * VISIBLE, overflow: "hidden" },
  /** Two rows of air either side, so the first option can reach the band. */
  content: { paddingVertical: WHEEL_ROW * 2 },
  row: { height: WHEEL_ROW, justifyContent: "center" },
  // A row has no edge of its own, so the ring is drawn *inside* it: outside,
  // the column's `overflow: hidden` would cut it off on both sides.
  rowFocused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: -focus.width,
    borderRadius: radius.sm,
  },
  option: {
    textAlign: "center",
    color: theme.text,
    ...text.ui("body", 500),
  },
  selected: { color: theme.accentText, ...text.ui("body", 600) },
  /**
   * **The fade stops where the text stops being readable.** A drum wants a
   * steep ramp — the artboards for this used `.55 / .26 / .12` and look better
   * for it — but every row is a real option a reader can land on, and at 16px
   * the 4.5:1 floor is reached at exactly `.7`: measured against
   * `theme.surface`, `.7` is 5.08:1 and `.65` is already 4.38:1. The axe pass
   * in the visual suite fails all eight wheel stories on the steeper ramp.
   *
   * So depth is carried by the band and the weight instead — the selected row
   * is accent, 600, on a tinted ground — and the ramp does what it can above
   * the floor.
   */
  near: { opacity: 0.85 },
  mid: { opacity: 0.7 },
  far: { opacity: 0.7 },
}));

export const wheelMetrics = { row: WHEEL_ROW, visible: VISIBLE, radius: radius.sm, gap: space.xs };
