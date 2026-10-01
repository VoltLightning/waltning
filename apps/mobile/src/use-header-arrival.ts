import { useReducedMotion } from "@waltning/ui/primitives/reduced-motion";
import { useEffect, useRef } from "react";
import { type SharedValue, useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { pageArrived, pageReset } from "./header-offset.ts";

/**
 * Hands the header a page's own offset when the page becomes the one on screen
 * (`header-offset.ts`). Reduced motion is read into a shared value so the
 * worklet can choose between a timing and an instant write.
 */
export function useHeaderArrival(
  showing: SharedValue<boolean>,
  own: SharedValue<number>,
  header: SharedValue<number>,
  rearm?: boolean,
): void {
  const reduced = useSharedValue(false);
  const prefers = useReducedMotion();
  useEffect(() => {
    reduced.value = prefers;
  }, [reduced, prefers]);
  // The page's content was swapped while it is on screen (`pageReset`). The
  // first run is the mount, which the reaction below already covers.
  const mounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `rearm` changing is the event; its value is not read
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    pageReset(showing, own, header, reduced);
  }, [rearm, showing, own, header, reduced]);
  useAnimatedReaction(
    () => showing.value,
    (now) => pageArrived(now, own, header, reduced),
    [showing, own, header, reduced],
  );
}
