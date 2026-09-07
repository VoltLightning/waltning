/**
 * Every scroller in this app says which of three things it is, and gets the
 * props that go with it.
 *
 * **The distinction is not syntactic, so it has to be declared.** A scroller
 * is the outermost one on its screen — the page, whose movement is its own
 * feedback — or a bounded one inside something else, whose end must be its
 * end. Nothing about a `<ScrollView>` says which, and getting it wrong is
 * invisible until someone scrolls: a page that hides its bar for no reason, or
 * a picker that drags the screen along behind it.
 *
 * **Containment needs both halves and only one of them is portable.**
 * `nestedScrollEnabled` makes the view a nested-scrolling *child* on Android;
 * iOS does this by default; on the web it does nothing at all. The web half is
 * `overscroll-behavior`, a CSS property `react-native-web` forwards and native
 * has no equivalent for. The shipped app set the first alone on three pickers,
 * which is why the bug was only ever reported from a browser.
 *
 * **The axis is part of the answer.** `react-native-web` expands
 * `overscrollBehavior` to *both* axes, and gives a horizontal `ScrollView`
 * `overflow-y: hidden` — which still makes it a scroll container, so
 * `overscroll-behavior-y: contain` on a chip row stops a vertical drag that
 * starts on the row from scrolling the sheet it sits in. A horizontal scroller
 * therefore contains **x only**. Its Android half is unchanged:
 * `ReactHorizontalScrollViewManager` implements `nestedScrollEnabled` like its
 * vertical sibling, so the prop stays. Only the CSS is axis-specific, because
 * only the CSS applies to both axes at once.
 *
 * Each helper takes the scroller's style and returns it, so containment and
 * layout arrive as one value. That is a convenience, not a guarantee: JSX
 * props are last-write-wins, so anything spread *after* a helper replaces the
 * style it returned while leaving `nestedScrollEnabled` in place — the shipped
 * defect exactly. What holds is an ordering rule — nothing that can set
 * `style` may follow the declaration, refused otherwise by
 * `tests/architecture.test.ts`, which parses the JSX with the compiler rather
 * than a regular expression.
 *
 * **And the containment itself is asserted on rendered components**, in each
 * picker's, sheet's and rail's own test, through
 * `expectContainsOverscroll` — because a rule that reads source is a census of
 * declarations, never a guarantee about behaviour. `nested-scroll.test.tsx`
 * checks what these helpers hand to `react-native-web`; the call-site tests
 * check that the element a person actually scrolls got it.
 *
 * ```tsx
 * <ScrollView {...nestedScrollProps(styles.panelScroll)}>        // bounded
 * <ScrollView horizontal {...horizontalScrollProps(styles.row)}> // bounded, sideways
 * <FlatList {...pageScrollProps(styles.list)} … />               // the page
 * ```
 *
 * The one scroller that is none of these is `BottomSheet`'s body: bounded, so
 * it contains, but not a nested-scrolling child of anything (a `Modal` has
 * nothing behind it to be a child of). It spreads `containOverscroll` into its
 * own style instead.
 */

import type { StyleProp, ViewStyle } from "react-native";

/**
 * `overscroll-behavior` is a web property `react-native-web` forwards to CSS
 * and native has no equivalent for, so `ViewStyle` does not declare it. Named
 * as an intersection rather than cast: the shape stays checked, and the extra
 * properties are visible instead of hidden behind an assertion.
 */
type OverscrollStyle = ViewStyle & {
  overscrollBehavior?: "contain";
  overscrollBehaviorX?: "contain";
};

/** Both axes — for a scroller whose whole travel is bounded. */
export const containOverscroll: OverscrollStyle = { overscrollBehavior: "contain" };

/**
 * The scrolling axis only, for a horizontal scroller. Leaves the cross axis
 * alone so a vertical drag starting on the row still reaches the page or sheet
 * that owns it.
 */
export const containOverscrollX: OverscrollStyle = { overscrollBehaviorX: "contain" };

/** A bounded vertical scroller inside something else. Android via the prop, web via the style. */
export function nestedScrollProps(style: StyleProp<ViewStyle>): {
  nestedScrollEnabled: true;
  style: StyleProp<ViewStyle>;
} {
  return { nestedScrollEnabled: true, style: [style, containOverscroll] };
}

/**
 * A bounded horizontal scroller — a chip row. Same Android half as its
 * vertical sibling; the CSS contains its own axis and no more, so a vertical
 * drag that starts on the row still reaches the sheet under it.
 */
export function horizontalScrollProps(style: StyleProp<ViewStyle>): {
  nestedScrollEnabled: true;
  style: StyleProp<ViewStyle>;
} {
  return { nestedScrollEnabled: true, style: [style, containOverscrollX] };
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
