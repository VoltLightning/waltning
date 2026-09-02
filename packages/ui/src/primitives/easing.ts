/**
 * The §2.7 curves, parsed once for `Animated`.
 *
 * `motion.*.easing` is a CSS `cubic-bezier(…)` string because the tokens also
 * feed the web; React Native's `Easing.bezier` wants the four numbers. This
 * was a private helper inside `press-scale.ts` until the selection controls
 * became its fourth, fifth and sixth callers — past the third use it is a
 * shared fact, not a press-feedback detail.
 *
 * A token that is not a cubic-bezier — `linear`, or a typo — falls back to a
 * plain ease-out rather than to `NaN` control points, which `Easing.bezier`
 * would accept and render as no animation at all.
 */

import { Easing } from "react-native";
import { motion } from "../tokens.ts";

type EasingFunction = (value: number) => number;

function parse(easing: string): EasingFunction {
  const inner = /cubic-bezier\(([^)]+)\)/.exec(easing)?.[1];
  const [x1, y1, x2, y2] = (inner ?? "").split(",").map(Number);
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return Easing.out(Easing.quad);
  }
  if ([x1, y1, x2, y2].some(Number.isNaN)) return Easing.out(Easing.quad);
  return Easing.bezier(x1, y1, x2, y2);
}

/** One parsed curve per motion token, built at module load. */
export const easing: Record<keyof typeof motion, EasingFunction> = {
  fast: parse(motion.fast.easing),
  base: parse(motion.base.easing),
  move: parse(motion.move.easing),
  fold: parse(motion.fold.easing),
  sheet: parse(motion.sheet.easing),
  none: parse(motion.none.easing),
};
