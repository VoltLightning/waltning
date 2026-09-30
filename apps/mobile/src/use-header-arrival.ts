import { useReducedMotion } from "@waltning/ui/primitives/reduced-motion";
import { useEffect } from "react";
import { type SharedValue, useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { pageArrived } from "./header-offset.ts";

/**
 * Hands the header a page's own offset when the page becomes the one on screen
 * (`header-offset.ts`). Reduced motion is read into a shared value so the
 * worklet can choose between a timing and an instant write.
 */
export function useHeaderArrival(
  showing: SharedValue<boolean>,
  own: SharedValue<number>,
  header: SharedValue<number>,
): void {
  const reduced = useSharedValue(false);
  const prefers = useReducedMotion();
  useEffect(() => {
    reduced.value = prefers;
  }, [reduced, prefers]);
  useAnimatedReaction(
    () => showing.value,
    (now) => pageArrived(now, own, header, reduced),
    [showing, own, header, reduced],
  );
}
