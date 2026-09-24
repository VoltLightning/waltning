/**
 * `useHeroScroll` — the page's scroll offset on the UI thread, for S09's
 * header band to fold against (`TransactionHero`, `HeroHeaderTitle`).
 *
 * **Stable by construction.** The handler is built once with its one
 * dependency, so a render of the screen never hands `GroundPanel` a new
 * handler — the same reason `today-screen.tsx` gives for its own.
 */

import {
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

export type HeroScroll = {
  scrollY: SharedValue<number>;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
};

export function useHeroScroll(): HeroScroll {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        scrollY.value = event.contentOffset.y;
      },
    },
    [scrollY],
  );
  return { scrollY, onScroll };
}
