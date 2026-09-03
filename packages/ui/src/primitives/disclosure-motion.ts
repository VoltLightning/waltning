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

import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { motion } from "../tokens.ts";
import { easing } from "./easing.ts";
import { useReducedMotion } from "./reduced-motion.ts";

export type DisclosureMotion = {
  /** Interpolated: "0deg" closed, "180deg" open. */
  rotate: Animated.AnimatedInterpolation<string>;
  /** The panel's opacity, restarted from 0 on each open. */
  reveal: Animated.Value;
};

export function useDisclosureMotion(open: boolean): DisclosureMotion {
  const reduced = useReducedMotion();
  const turn = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(turn, {
      toValue: open ? 1 : 0,
      duration: reduced ? motion.none.duration : motion.move.duration,
      easing: easing.move,
      useNativeDriver: true,
    }).start();
    if (open) {
      reveal.setValue(0);
      Animated.timing(reveal, {
        toValue: 1,
        duration: reduced ? motion.none.duration : motion.fast.duration,
        easing: easing.fast,
        useNativeDriver: true,
      }).start();
    }
  }, [open, reduced, reveal, turn]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return { rotate, reveal };
}
