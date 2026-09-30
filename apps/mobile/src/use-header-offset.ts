import { useEffect } from "react";
import {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

/**
 * One page's scroll handler, for a header that reads one offset for several
 * pages.
 *
 * **Each page keeps its own offset and lends it to the header only while it is
 * the page on screen.** The header collapses from a single shared value; with
 * four pages writing it, the value meant whatever page scrolled last, and
 * swiping to a page that was at the top left the header collapsed over it.
 * Now the page remembers where it is, and on becoming the page on screen it
 * hands that offset to the header — so the header's shape is always a function
 * of the scroll of the page the reader is looking at, and of nothing else.
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
  useAnimatedReaction(
    () => active.value,
    (now) => {
      if (now) scrollY.value = offset.value;
    },
    [active, offset, scrollY],
  );
  return useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        offset.value = event.contentOffset.y;
        if (active.value) scrollY.value = event.contentOffset.y;
      },
    },
    [active, offset, scrollY],
  );
}
