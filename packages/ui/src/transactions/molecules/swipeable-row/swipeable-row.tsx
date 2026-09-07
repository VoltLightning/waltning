/**
 * `<SwipeableRow>` — S10 §4, §7: short swipe categorises, long swipe edits.
 * **Nothing destructive is ever on a swipe** (`design-system/05` §5.6) — this
 * component has no delete path at all, only the two callbacks below.
 *
 * **A release-distance gesture, not a reveal-then-tap one.** The row follows
 * the finger 1:1 on `translateX`; on release, the distance travelled decides
 * the outcome — past `LONG_THRESHOLD` fires `onLongSwipe`, past
 * `SHORT_THRESHOLD` fires `onShortSwipe`, short of both it springs back to
 * zero and nothing happens. No action stays pinned open waiting for a second
 * tap, which is the one property that keeps a swipe from ever being mistaken
 * for a delete.
 *
 * **Either direction fires the same pair.** S10 does not assign left and
 * right to different actions, so a right swipe and a left swipe of the same
 * distance mean the same thing — simpler for a thumb than "always leftward,"
 * and nothing in the spec asks for the second axis.
 *
 * **Its own spring, not `shell/float-geometry.ts`'s.** That module is
 * `FloatingAdd`'s own domain (`architecture/11`: no module imports a
 * sibling domain), and a snap-back has none of `settleSpring`'s
 * edge-avoidance problem to solve — a fixed, comfortably critically-damped
 * config is the whole of what returning to zero needs.
 */

import { useCallback, useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/** Finger travel before a touch stops being a tap — matches `FloatingAdd`'s own slop. */
const DRAG_SLOP = 4;

/** Short swipe — categorise. */
const SHORT_THRESHOLD = 40;

/** Long swipe — edit, well past the short threshold so the two are never confused. */
const LONG_THRESHOLD = 140;

const SPRING = { stiffness: 260, damping: 26, mass: 1 };

export type SwipeableRowProps = {
  onShortSwipe: () => void;
  onLongSwipe: () => void;
  children: React.ReactNode;
};

export function SwipeableRow({ onShortSwipe, onLongSwipe, children }: SwipeableRowProps) {
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const settle = useCallback(() => {
    translateX.value = withSpring(0, SPRING);
  }, [translateX]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(DRAG_SLOP)
        .onStart(() => {
          "worklet";
          startX.value = translateX.value;
        })
        .onUpdate((e) => {
          "worklet";
          translateX.value = startX.value + e.translationX;
        })
        .onEnd((e) => {
          "worklet";
          const distance = Math.abs(startX.value + e.translationX);
          runOnJS(settle)();
          if (distance >= LONG_THRESHOLD) {
            runOnJS(onLongSwipe)();
          } else if (distance >= SHORT_THRESHOLD) {
            runOnJS(onShortSwipe)();
          }
        }),
    [onLongSwipe, onShortSwipe, settle, startX, translateX],
  );

  const motion = useAnimatedStyle(
    () => ({ transform: [{ translateX: translateX.value }] }),
    [translateX],
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={motion}>{children}</Animated.View>
    </GestureDetector>
  );
}
