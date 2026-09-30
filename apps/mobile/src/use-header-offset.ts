import { useEffect } from "react";
import {
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { pageScrolled } from "./header-offset.ts";
import { useHeaderArrival } from "./use-header-arrival.ts";

/**
 * One page's scroll handler, for a header that reads one offset for several
 * pages (`header-offset.ts` has the rules).
 *
 * `showing` is an ordinary prop; the worklets read it through a shared value so
 * a page change does not rebuild the handler and, with it, the page element.
 */
export function useHeaderOffset(scrollY: SharedValue<number>, showing: boolean) {
  const active = useSharedValue(showing);
  const offset = useSharedValue(0);
  useEffect(() => {
    active.value = showing;
  }, [active, showing]);
  useHeaderArrival(active, offset, scrollY);
  return useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        pageScrolled(active, offset, scrollY, event.contentOffset.y);
      },
    },
    [active, offset, scrollY],
  );
}
