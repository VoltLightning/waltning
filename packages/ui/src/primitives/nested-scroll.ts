/**
 * What a bounded scroller inside another scroller has to say on each platform
 * so that reaching its end stops there.
 *
 * **The two halves solve the same problem and neither one covers both.**
 * `nestedScrollEnabled` makes the view it is set on a nested-scrolling *child*
 * on Android; iOS does this by default; and on the web it is a no-op. The web
 * fix is `overscroll-behavior: contain`, a CSS property `react-native-web`
 * forwards and native has no equivalent for. A picker with only the first is
 * exactly the bug reported against the shipped app: scrolling inside the list
 * moved the screen behind it, in a browser, because the one property that was
 * set is the one that does nothing there.
 *
 * So the pair travels together, as one call rather than two things to
 * remember: a helper that has to be applied in two halves is a helper that
 * gets applied in one. Spread it onto the **inner, bounded** scroller — never
 * onto the page scroller or the sheet body it sits in, which are the things
 * that must *not* move.
 *
 * ```tsx
 * <ScrollView {...nestedScrollProps(styles.panelScroll)}>
 * ```
 */

import type { StyleProp, ViewStyle } from "react-native";

/**
 * `overscroll-behavior` is a web property `react-native-web` forwards to CSS
 * and native has no equivalent for, so `ViewStyle` does not declare it. Named
 * as an intersection rather than cast: the shape stays checked, and the one
 * extra property is visible instead of hidden behind an assertion.
 */
export const containOverscroll: ViewStyle & { overscrollBehavior?: "contain" } = {
  overscrollBehavior: "contain",
};

/**
 * Spread onto the inner scroller: Android via the prop, web via the style.
 * Takes the scroller's own style so the containment cannot be lost to a
 * `style` that arrives after the spread.
 */
export function nestedScrollProps(style: StyleProp<ViewStyle>): {
  nestedScrollEnabled: true;
  style: StyleProp<ViewStyle>;
} {
  return { nestedScrollEnabled: true, style: [style, containOverscroll] };
}
