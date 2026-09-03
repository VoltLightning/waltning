/**
 * `useDisclosureMotion` — the chevron's turn and the panel's arrival, shared
 * by both field shapes.
 *
 * Extracted when `MultiSelect` grew its own field: its chosen labels became
 * removable tokens, and a token is a button — which cannot live inside the
 * field-wide Pressable the single `Select` uses, because a focusable control
 * inside a control is an axe violation (`nested-interactive`) and a
 * screen-reader trap. Two field layouts, one motion.
 *
 * The pair is §2.7 verbatim: rotation at `motion.move` (a visible thing
 * moving), arrival at `motion.fast` as opacity — never height. Both take the
 * `motion-none` branch.
 */

import { useEffect } from "react";
import type { ViewStyle } from "react-native";
import {
  type AnimatedStyle,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motion } from "../tokens.ts";
import { easing } from "./easing.ts";
import { useReducedMotion } from "./reduced-motion.ts";

export type DisclosureMotion = {
  /** The chevron: turns half a circle as the panel opens. */
  chevron: AnimatedStyle<ViewStyle>;
  /** The panel: fades in on open — opacity only, never a height (§2.7). */
  panel: AnimatedStyle<ViewStyle>;
};

export function useDisclosureMotion(open: boolean): DisclosureMotion {
  const reduced = useReducedMotion();
  const turn = useSharedValue(open ? 1 : 0);
  const reveal = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, {
      duration: reduced ? motion.none.duration : motion.move.duration,
      easing: easing.move,
    });
    if (open) {
      reveal.value = 0;
      reveal.value = withTiming(1, {
        duration: reduced ? motion.none.duration : motion.fast.duration,
        easing: easing.fast,
      });
    }
  }, [open, reduced, reveal, turn]);

  // Dependency arrays: on the web without the Babel plugin they are how
  // Reanimated learns which shared values a style reads.
  const chevron = useAnimatedStyle(
    () => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }),
    [turn],
  );
  const panel = useAnimatedStyle(() => ({ opacity: reveal.value }), [reveal]);
  return { chevron, panel };
}
