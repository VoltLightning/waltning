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

import { useCallback } from "react";
import type { ViewStyle } from "react-native";
import {
  type AnimatedStyle,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motion } from "../tokens.ts";
import { easing } from "./easing.ts";

const PRESSED = 0.97;

export type PressScale = {
  style: AnimatedStyle<ViewStyle>;
  onPressIn: () => void;
  onPressOut: () => void;
};

/**
 * On the UI thread, as everything that moves here is: the shared value is
 * written from a press handler and read by the style worklet, and the JS
 * thread being busy with a list never makes a press feel late.
 */
export function usePressScale(): PressScale {
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    scale.value = withTiming(PRESSED, { duration: motion.base.duration, easing: easing.base });
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: motion.fast.duration, easing: easing.fast });
  }, [scale]);

  // The dependency array is not optional on the web: without the Babel plugin
  // Reanimated cannot see the closure, and the array is how it learns which
  // shared values the style reads.
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }), [scale]);

  return { style, onPressIn, onPressOut };
}
