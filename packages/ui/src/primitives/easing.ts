/**
 * The motion tokens' curves, as Reanimated easings.
 *
 * `motion.*.easing` is a CSS `cubic-bezier(…)` string because the design
 * system is written for two renderers and CSS is the notation both readers
 * know. Parsed once, here, into the functions `withTiming` takes.
 */

import { Easing, type EasingFunction, type EasingFunctionFactory } from "react-native-reanimated";
import { motion } from "../tokens.ts";

type Curve = EasingFunction | EasingFunctionFactory;

function parse(easing: string): Curve {
  const inner = /cubic-bezier\(([^)]+)\)/.exec(easing)?.[1];
  const [x1, y1, x2, y2] = (inner ?? "").split(",").map(Number);
  // A token that is not a cubic-bezier — `linear`, or a typo — falls back to
  // a plain ease-out rather than to `NaN` control points, which `Easing.bezier`
  // would accept and render as no animation at all.
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return Easing.out(Easing.quad);
  }
  if ([x1, y1, x2, y2].some(Number.isNaN)) return Easing.out(Easing.quad);
  return Easing.bezier(x1, y1, x2, y2);
}

export const easing: Record<keyof typeof motion, Curve> = {
  fast: parse(motion.fast.easing),
  base: parse(motion.base.easing),
  move: parse(motion.move.easing),
  fold: parse(motion.fold.easing),
  sheet: parse(motion.sheet.easing),
  none: parse(motion.none.easing),
};
