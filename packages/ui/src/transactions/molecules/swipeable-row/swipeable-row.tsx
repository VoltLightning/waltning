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
 * **It owns one axis, and gives up the other.** A pan with only a minimum
 * distance activates in *any* direction, and these rows cover most of a screen
 * whose list scrolls vertically — so every attempt to scroll from a row was
 * claimed by that row and the list stood still. The gesture now activates on
 * sideways travel and fails on downward travel, with the sideways threshold
 * the larger of the two, so the common gesture wins ties.
 *
 * **Its own spring, not `shell/float-geometry.ts`'s.** That module is
 * `FloatingAdd`'s own domain (`architecture/11`: no module imports a
 * sibling domain), and a snap-back has none of `settleSpring`'s
 * edge-avoidance problem to solve — a fixed, comfortably critically-damped
 * config is the whole of what returning to zero needs.
 */

import { useCallback, useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/**
 * Sideways travel before a touch becomes a swipe.
 *
 * **Bigger than the vertical slop below, and that ordering is the whole
 * point.** These rows sit inside a list that scrolls the other way, and the
 * gesture that wins is whichever axis passes its threshold first — so a
 * horizontal threshold *above* the vertical one means a drag has to be
 * decidedly sideways to be read as a swipe, and anything close to vertical
 * goes to the list.
 */
const SIDEWAYS_SLOP = 12;

/**
 * Downward travel after which this gesture gives up and the list takes over.
 *
 * **Without it the list could not be scrolled at all from a row.** The first
 * version asked only for `minDistance(4)`, which activates a pan in *any*
 * direction — so every scroll that began on a transaction row, which is most
 * of the surface of this screen, was claimed by that row and the list never
 * moved. A pan inside a scroller has to be told which axis it owns; nothing
 * infers it.
 */
const VERTICAL_SLOP = 8;

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
        // Horizontal only, and it yields to a vertical drag — see the two
        // constants above for why the thresholds are ordered as they are.
        .activeOffsetX([-SIDEWAYS_SLOP, SIDEWAYS_SLOP])
        .failOffsetY([-VERTICAL_SLOP, VERTICAL_SLOP])
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
          scheduleOnRN(settle);
          if (distance >= LONG_THRESHOLD) {
            scheduleOnRN(onLongSwipe);
          } else if (distance >= SHORT_THRESHOLD) {
            scheduleOnRN(onShortSwipe);
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
