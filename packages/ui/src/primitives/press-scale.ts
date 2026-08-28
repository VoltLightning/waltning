/**
 * Press feedback for every `Pressable` — `design-system/02` §2.7.
 *
 * `scale(.97)` on press, and it is **asymmetric**: in at `motion.base`, out at
 * `motion.fast`. Slow where the person is deciding, quick where the system
 * responds — the release is the system saying "got it", and a slow "got it"
 * reads as lag.
 *
 * **A transform, not an opacity.** The old feedback was `opacity: .85` on
 * `pressed`, which is the property the practitioners list under "never": it
 * repaints the whole subtree, and it reads as the control *fading* rather than
 * being *pushed*. Scale is the physical metaphor and the GPU path.
 *
 * **One hook rather than a style per component**, because the point is that
 * every control feels like the same material. A button that scales to .97 and
 * a chip that scales to .95 are two materials, and nobody decided that.
 *
 * `Animated` rather than a style-callback swap because a swap is a hard cut:
 * the finger lands and the control is already at .97. The 200ms in is what
 * makes it feel pressed rather than replaced. Native driver on both platforms —
 * scale is a transform, so it never touches the JS thread mid-gesture.
 */

import { useCallback, useRef } from "react";
import { Animated, Easing } from "react-native";
import { motion } from "../tokens.ts";

const PRESSED = 0.97;

/** The two curves, parsed once. `motion.*.easing` is a CSS string for the web. */
function bezier(easing: string) {
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

const EASE_IN = bezier(motion.base.easing);
const EASE_OUT = bezier(motion.fast.easing);

export type PressScale = {
  /** Spread onto the `Animated.View` that wraps the `Pressable`. */
  style: { transform: { scale: Animated.Value }[] };
  onPressIn: () => void;
  onPressOut: () => void;
};

export function usePressScale(): PressScale {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.timing(scale, {
      toValue: PRESSED,
      duration: motion.base.duration,
      easing: EASE_IN,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const onPressOut = useCallback(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration: motion.fast.duration,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return { style: { transform: [{ scale }] }, onPressIn, onPressOut };
}
