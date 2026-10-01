/**
 * A pushed screen's arrival on the **web**, where the navigator draws none.
 *
 * On a phone `Stack`'s own `animation: "fade"` (`stackMotion`) does the work.
 * The web build's `NativeStackView` ignores that option and mounts the new
 * screen with no transition at all, which is the swap the owner objected to —
 * so here the screen fades itself in over the same ~150 ms when it mounts, and
 * not at all under `prefers-reduced-motion`.
 *
 * A pushed screen mounts once per push, so an entering animation on its
 * content is exactly "opacity on arrival". Reanimated, because nothing else in
 * this app moves anything (`architecture/11` §8b); on a phone this renders its
 * children untouched, so a screen never fades twice.
 */

import { useReducedMotion } from "@waltning/ui/primitives/reduced-motion";
import { SCREEN_FADE_MS } from "@waltning/ui/primitives/stack-motion";
import type { ReactElement, ReactNode } from "react";
import { Platform } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

const fill = { flex: 1 } as const;

export function ScreenFade({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <Animated.View style={fill} {...(reduced ? {} : { entering: FadeIn.duration(SCREEN_FADE_MS) })}>
      {children}
    </Animated.View>
  );
}

/** `Stack`'s `screenLayout`: every route's content inside the fade. */
export function screenLayout({ children }: { children: ReactElement }): ReactElement {
  return <ScreenFade>{children}</ScreenFade>;
}
