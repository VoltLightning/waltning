/**
 * `<ThresholdSlider>` — `design-system/08` §8.6 row 3 (J4: *"Threshold not
 * draggable"*). The bulk-accept confidence bar for the import review screen.
 *
 * **0.50–0.99, and it cannot reach 1.00.** A rule that could be set to exact
 * certainty would eventually be, and a tier-1.5 payee match is never that —
 * the floor and the ceiling are both load-bearing, not cosmetic rounding.
 * Value is always shown as a two-decimal figure, because `0.8` beside `0.83`
 * on the same control reads as more precision than the lower one carries.
 *
 * **The live count beside a nearby button — `S02c`'s "Accept 14 above 0.83"
 * — is the caller's job**, not this component's: this control only ever
 * knows the threshold, never how many rows are above it.
 *
 * **Redesigned from a flat bar with no fill and a plain top-left label**
 * (the owner's own words: *"looks bad, hard to use"*). The whole 44px row is
 * the target — `offsetToValue` maps a touch anywhere in it to a value, so a
 * finger never has to land on the 28px thumb, and a tap sets the value in one
 * motion rather than requiring a drag from wherever the thumb happened to be.
 *
 * The drag is a `Gesture.Pan`, worklet-only per this package's Reanimated
 * rule. `offsetToValue` is exported and called from both `onStart` and
 * `onUpdate` — one function for "tap sets it" and "drag follows the finger",
 * and the one this file's test exercises directly: `GestureDetector` renders
 * inert under `vitest` (`.vitest/gesture-handler.ts`), so the mapping is
 * tested as arithmetic, the way `float-geometry.ts` is for the add button.
 *
 * Two keyboard paths, because no one mechanism reaches both targets:
 * `onAccessibilityAction` is what VoiceOver/TalkBack drive on the phone, and
 * `onKeyDown`'s arrow keys are what a browser's own keyboard focus drives —
 * `react-native-web` forwards `onKeyDown` (`forwardedProps` allowlists it)
 * even though core React Native's `View` type does not declare it, which is
 * why it arrives here as a small, separately-typed prop bag rather than a
 * literal JSX attribute the stricter type would refuse.
 */

import { useCallback, useMemo, useState } from "react";
import { type AccessibilityActionEvent, type LayoutChangeEvent, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle } from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, tabularNums, touchTarget } from "../tokens.ts";

export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 0.99;
const STEP = 0.01;
/** Shift+arrow — a bigger step for a keyboard user covering the range fast. */
const BIG_STEP = 0.05;

const THUMB = 28;
const TRACK_HEIGHT = 4;
const ROW_HEIGHT = touchTarget.min;
const TRACK_TOP = (ROW_HEIGHT - TRACK_HEIGHT) / 2;
const THUMB_TOP = (ROW_HEIGHT - THUMB) / 2;
const TICK_SIZE = { width: 1, height: 4 };
const TICK_TOP = TRACK_TOP + TRACK_HEIGHT + 2;
/** The caption line (16) plus its `xxs` vertical padding on both sides. */
const BADGE_HEIGHT = 20;
const BADGE_GAP = space.xs;

/**
 * Every 0.10 from the floor — 0.50, 0.60 … 0.90 — hardcoded rather than
 * stepped in a loop: five values is not worth a float accumulation risk, and
 * the range is fixed by `THRESHOLD_MIN`/`MAX` themselves.
 */
const TICK_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

export type ThresholdSliderProps = {
  value: number;
  onChange: (next: number) => void;
};

function clamp(value: number): number {
  const stepped = Math.round(value / STEP) * STEP;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, stepped));
}

function fraction(value: number): number {
  return (clamp(value) - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN);
}

/**
 * A touch's `x`, relative to the 44px row, as a threshold value.
 *
 * The one function both a tap and a drag call: `offsetX` at the moment a
 * finger lands **is** the target for a tap, and is recomputed on every
 * `onUpdate` for a drag — there is no separate "start from the current value
 * and add a delta" path, so a tap that never moves still sets the value.
 * `THUMB / 2` re-centres the thumb (not the row's left edge) under the
 * finger, which is what makes the thumb track the touch point exactly.
 */
export function offsetToValue(offsetX: number, usable: number): number {
  if (usable <= 0) return THRESHOLD_MIN;
  const adjusted = Math.min(usable, Math.max(0, offsetX - THUMB / 2));
  return clamp(THRESHOLD_MIN + (adjusted / usable) * (THRESHOLD_MAX - THRESHOLD_MIN));
}

export function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  const t = useT();
  const styles = useStyles();
  const reduced = useReducedMotion();
  const { focused, handlers } = useInteraction();
  const press = usePressScale();
  const [trackWidth, setTrackWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const usable = Math.max(0, trackWidth - THUMB);
  const clamped = clamp(value);

  const handleChange = useCallback(
    (next: number) => {
      const stepped = clamp(next);
      if (stepped !== clamped) onChange(stepped);
    },
    [clamped, onChange],
  );

  const pan = useMemo(() => {
    return (
      Gesture.Pan()
        .enabled(usable > 0)
        // Zero minimum distance: this row *is* the "choose a value" gesture,
        // so a plain tap-and-release has to set it on its own, not only a drag
        // past some slop.
        .minDistance(0)
        .onStart((event) => {
          "worklet";
          if (!reduced) runOnJS(press.onPressIn)();
          runOnJS(handleChange)(offsetToValue(event.x, usable));
        })
        .onUpdate((event) => {
          "worklet";
          runOnJS(handleChange)(offsetToValue(event.x, usable));
        })
        .onEnd(() => {
          "worklet";
          if (!reduced) runOnJS(press.onPressOut)();
        })
    );
  }, [usable, reduced, handleChange, press.onPressIn, press.onPressOut]);

  const positionStyle = useAnimatedStyle(
    () => ({ left: fraction(value) * usable }),
    [value, usable],
  );
  const fillStyle = useAnimatedStyle(
    () => ({ width: fraction(value) * usable + THUMB / 2 }),
    [value, usable],
  );

  // Built here, not as an object literal in the JSX below (`dock.tsx`'s own
  // `clearance` precedent) — each tick's `left` is per-render arithmetic, not
  // a theme-scale constant `makeStyles` could hold.
  const tickStyles = TICK_VALUES.map((tickValue) => ({
    value: tickValue,
    style: { left: fraction(tickValue) * usable + THUMB / 2 - TICK_SIZE.width / 2 },
  }));

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "increment") handleChange(clamped + STEP);
      if (event.nativeEvent.actionName === "decrement") handleChange(clamped - STEP);
    },
    [clamped, handleChange],
  );

  /**
   * `View`'s React Native type has no `onKeyDown` — see the file doc. Kept as
   * a separately-typed prop bag rather than an inline JSX attribute so the
   * one narrow escape from the stricter type is visible in one place.
   */
  const keyboardProps: { onKeyDown: (event: KeyboardEvent) => void } = {
    onKeyDown: (event) => {
      const step = event.shiftKey ? BIG_STEP : STEP;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        handleChange(clamped + step);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        handleChange(clamped - step);
      }
      if (event.key === "Home") {
        event.preventDefault();
        handleChange(THRESHOLD_MIN);
      }
      if (event.key === "End") {
        event.preventDefault();
        handleChange(THRESHOLD_MAX);
      }
    },
  };

  /**
   * `react-native-web` does not read the RN-core `accessibilityValue` object
   * at all — its `View` only forwards the flat, legacy
   * `accessibilityValue{Min,Max,Now}` names (`forwardedProps.accessibilityProps`
   * lists those three and not the nested prop), so `aria-valuenow` never
   * reaches the DOM without them and axe's `aria-required-attr` fails on the
   * `slider` role. Both forms are supplied: the object for native, this bag
   * for the web target.
   */
  const ariaValueProps: {
    accessibilityValueMin: number;
    accessibilityValueMax: number;
    accessibilityValueNow: number;
  } = {
    accessibilityValueMin: THRESHOLD_MIN,
    accessibilityValueMax: THRESHOLD_MAX,
    accessibilityValueNow: clamped,
  };

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pan}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={t("states.threshold")}
          accessibilityValue={{
            min: THRESHOLD_MIN,
            max: THRESHOLD_MAX,
            now: clamped,
            text: clamped.toFixed(2),
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={onAccessibilityAction}
          focusable
          {...keyboardProps}
          {...ariaValueProps}
          {...handlers}
          onLayout={onLayout}
          style={[styles.row, focused ? styles.focused : null]}
        >
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </View>
          {tickStyles.map((tick) => (
            <View key={tick.value} style={[styles.tick, tick.style]} />
          ))}
          <Animated.View style={[styles.thumb, positionStyle, reduced ? null : press.style]} />
          <Animated.View style={[styles.badge, positionStyle]}>
            <View style={styles.badgeInner}>
              <Text style={styles.badgeText}>{clamped.toFixed(2)}</Text>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.endLabels}>
        <Text style={styles.endLabel}>{THRESHOLD_MIN.toFixed(2)}</Text>
        <Text style={styles.endLabel}>{THRESHOLD_MAX.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  // Room above the row for the badge, which rides above the thumb rather
  // than sitting in the layout.
  root: { marginTop: BADGE_HEIGHT + BADGE_GAP, gap: space.xs },
  row: { height: ROW_HEIGHT },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
    borderRadius: radius.sm,
  },
  track: {
    position: "absolute",
    top: TRACK_TOP,
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: theme.border,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.sm,
    backgroundColor: theme.accent,
  },
  tick: {
    position: "absolute",
    top: TICK_TOP,
    width: TICK_SIZE.width,
    height: TICK_SIZE.height,
    backgroundColor: theme.border,
  },
  thumb: {
    position: "absolute",
    top: THUMB_TOP,
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: theme.accent,
    borderWidth: 2,
    borderColor: theme.surface,
  },
  badge: {
    position: "absolute",
    top: -(BADGE_HEIGHT + BADGE_GAP),
    width: THUMB,
    alignItems: "center",
  },
  badgeInner: {
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  badgeText: { ...text.ui("caption"), color: theme.text, fontVariant: [...tabularNums] },
  endLabels: { flexDirection: "row", justifyContent: "space-between" },
  endLabel: { ...text.ui("caption"), color: theme.textMuted, fontVariant: [...tabularNums] },
}));
