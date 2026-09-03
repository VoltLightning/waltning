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
 * The drag is a `Gesture.Pan`, worklet-only per this package's Reanimated
 * rule. Two keyboard paths, because no one mechanism reaches both targets:
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
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { makeStyles } from "../theme/styles.ts";
import { radius, space, touchTarget } from "../tokens.ts";

export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 0.99;
const STEP = 0.01;
const THUMB = 24;

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

export function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  const t = useT();
  const styles = useStyles();
  const [trackWidth, setTrackWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const usable = Math.max(0, trackWidth - THUMB);
  const startFraction = useSharedValue(0);
  const clamped = clamp(value);

  const handleChange = useCallback(
    (next: number) => {
      const stepped = clamp(next);
      if (stepped !== clamped) onChange(stepped);
    },
    [clamped, onChange],
  );

  const pan = useMemo(() => {
    return Gesture.Pan()
      .enabled(usable > 0)
      .onStart(() => {
        "worklet";
        startFraction.value = fraction(clamped);
      })
      .onUpdate((event) => {
        "worklet";
        if (usable <= 0) return;
        const next = Math.min(1, Math.max(0, startFraction.value + event.translationX / usable));
        const nextValue = THRESHOLD_MIN + next * (THRESHOLD_MAX - THRESHOLD_MIN);
        runOnJS(handleChange)(nextValue);
      });
  }, [usable, clamped, startFraction, handleChange]);

  const thumbStyle = useAnimatedStyle(() => ({ left: fraction(value) * usable }), [value, usable]);

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
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        handleChange(clamped + STEP);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        handleChange(clamped - STEP);
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
      <Text style={styles.value}>{clamped.toFixed(2)}</Text>
      <View style={styles.track} onLayout={onLayout}>
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityRole="adjustable"
            accessibilityLabel={t("states.threshold")}
            accessibilityValue={{ min: THRESHOLD_MIN, max: THRESHOLD_MAX, now: clamped }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={onAccessibilityAction}
            focusable
            {...keyboardProps}
            {...ariaValueProps}
            style={[styles.thumb, thumbStyle]}
          />
        </GestureDetector>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  value: { color: theme.text, fontVariant: ["tabular-nums"] },
  track: {
    height: touchTarget.min,
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: theme.accent,
  },
}));
