/**
 * Every scroller in this app says which of two things it is, and gets the
 * props that go with it.
 *
 * **The distinction is not syntactic, so it has to be declared.** A scroller
 * is either the outermost one on its screen — the page, whose movement is its
 * own feedback — or a bounded one inside something else, whose end must be its
 * end. Nothing about a `<ScrollView>` says which, and getting it wrong is
 * invisible until someone scrolls: a page that hides its bar for no reason, or
 * a picker that drags the screen along behind it.
 *
 * **Containment needs both halves and only one of them is portable.**
 * `nestedScrollEnabled` makes the view a nested-scrolling *child* on Android;
 * iOS does this by default; on the web it does nothing at all. The web half is
 * `overscroll-behavior: contain`, a CSS property `react-native-web` forwards
 * and native has no equivalent for. The shipped app set the first alone on
 * three pickers, which is why the bug was only ever reported from a browser.
 *
 * Both helpers take the scroller's style and return it, so the containment
 * cannot be separated from the element that needs it. A second `style` prop on
 * the same element would replace the returned one — JSX props are
 * last-write-wins — so `tests/architecture.test.ts` refuses that spelling
 * outright rather than trusting a call site to remember.
 *
 * ```tsx
 * <ScrollView {...nestedScrollProps(styles.panelScroll)}>   // bounded
 * <FlatList {...pageScrollProps(styles.list)} … />          // the page
 * ```
 *
 * The one scroller that is neither is `BottomSheet`'s body: bounded, so it
 * contains, but not a nested-scrolling child of anything (a `Modal` has
 * nothing behind it to be a child of). It spreads `containOverscroll` into its
 * own style instead, which the rule accepts as the third declared spelling.
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

/** A bounded scroller inside something else. Android via the prop, web via the style. */
export function nestedScrollProps(style: StyleProp<ViewStyle>): {
  nestedScrollEnabled: true;
  style: StyleProp<ViewStyle>;
} {
  return { nestedScrollEnabled: true, style: [style, containOverscroll] };
}

/**
 * The outermost scroller on a screen. No containment — there is nothing behind
 * it to chain into — and no indicator, because a whole page moving is its own
 * feedback and the bar only ever drew over the gutter.
 */
export function pageScrollProps(style: StyleProp<ViewStyle>): {
  showsVerticalScrollIndicator: false;
  style: StyleProp<ViewStyle>;
} {
  return { showsVerticalScrollIndicator: false, style };
}
