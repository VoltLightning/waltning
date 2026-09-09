/**
 * `usePeriodMotion` — the pages' arrival when the period changes (S04 §3).
 *
 * **Reanimated, and the geometry is `period-motion.ts`.** The style is a
 * worklet on the UI thread; every number it uses is a plain function `vitest`
 * can run, because the test setup mocks `interpolate` with a no-op and a
 * motion built from it would be a motion nothing checks.
 *
 * **It respects a reader who asked for less motion.** `motion.none` is a
 * duration, not a branch, so the same code runs and lands immediately — a
 * separate still path is a second implementation that stops being exercised.
 */

import { useEffect, useRef } from "react";
import type { ViewStyle } from "react-native";
import {
  type AnimatedStyle,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { easing } from "../../../primitives/easing.ts";
import { useReducedMotion } from "../../../primitives/reduced-motion.ts";
import { motion } from "../../../tokens.ts";
import { type Direction, enterOffset, enterOpacity, movesFor } from "./period-motion.ts";

export function usePeriodMotion(periodKey: string, pageKey: string): AnimatedStyle<ViewStyle> {
  const reduced = useReducedMotion();
  const progress = useSharedValue(1);
  const direction = useSharedValue<Direction>(0);
  // The period and the page this has already played. A ref rather than state:
  // it must not re-render the shell, and only the effect below reads it.
  const seen = useRef<{ period: string; page: string } | null>(null);

  useEffect(() => {
    const from = seen.current;
    seen.current = { period: periodKey, page: pageKey };
    const way = movesFor(from, { period: periodKey, page: pageKey });
    if (way === 0) {
      progress.value = 1;
      return;
    }
    direction.value = way;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduced ? motion.none.duration : motion.move.duration,
      easing: easing.move,
    });
  }, [periodKey, pageKey, reduced, progress, direction]);

  return useAnimatedStyle(
    () => ({
      opacity: enterOpacity(progress.value),
      transform: [{ translateX: enterOffset(direction.value, progress.value) }],
    }),
    [progress, direction],
  );
}
