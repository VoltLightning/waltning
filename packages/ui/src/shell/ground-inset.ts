/**
 * The padding a screen's own scroller has to carry — asked of the shell, in
 * the one mode where `GroundPanel` cannot apply it itself.
 *
 * **Padding belongs to the thing that scrolls, not to a box around it.** A
 * `ScrollView` and a `FlatList` clip their children at their own edge. Put the
 * gutter on a `View` wrapping one and three things follow, all of them wrong:
 * the scroll bar rides 22 pt inside the page rather than at its edge; a
 * focused field's ring — 2 pt wide at a 2 pt offset, so 4 pt outside the
 * field's box — is sliced off left and right by that clip; and the bottom
 * padding lands *inside* the scroll, so the last row stops short of the fold
 * instead of clearing the home indicator at the end of the travel.
 *
 * `GroundPanel scroll="page"` already gets this right: it owns the scroller
 * and puts the gutter on `contentContainerStyle`. `scroll="own"` is the mode
 * where the screen owns the scroller, so the panel has nothing to put the
 * gutter on and hands the value down instead — the same shape
 * `useFloatingClearance()` established, and for the same reason.
 *
 * **Spread it onto the scroller's `contentContainerStyle`**, and onto a
 * `View` around any sibling that is not the scroller (a search field, a chip
 * row) so the two agree on one gutter:
 *
 * ```tsx
 * const inset = useGroundInset();
 * <GroundPanel scroll="own">
 *   <View style={inset.gutter}><SearchField … /></View>
 *   <FlatList … contentContainerStyle={inset.content} />
 * </GroundPanel>
 * ```
 *
 * Three members, because the numbers are not the hard part — knowing what a
 * value may be attached to is. `gutter` is sides only, `content` goes on a
 * scroller's content, `block` on a non-scrolling child that ends the panel.
 */

import { useSafeArea } from "../primitives/safe-area";
import { space } from "../tokens.ts";
import { useFloatingClearance } from "./floating-clearance";

export type GroundInset = {
  /**
   * Left and right only — for a sibling of the scroller that shares its
   * gutter and is not the panel's last element (a search field, a chip row).
   */
  gutter: { paddingLeft: number; paddingRight: number };
  /**
   * The scroller's own `contentContainerStyle`: the gutter, plus the bottom
   * clearance — design padding, the home indicator, and whatever room the
   * shell says a floating button needs over this page.
   */
  content: { paddingLeft: number; paddingRight: number; paddingBottom: number };
  /**
   * The same values as `content`, for a child that is the panel's bottom edge
   * but is **not** a scroller: an empty state where the list would be, a
   * loading skeleton, or a row of independently scrolling panes at desk width.
   *
   * A separate name for identical numbers, because the whole defect class here
   * is a value applied to the wrong kind of thing. `content` says "this goes on
   * a `contentContainerStyle`"; a reviewer seeing it on a plain `View` should
   * be able to call that wrong without checking whether it happens to be
   * harmless. It is harmless exactly when the `View` holds no scroller.
   */
  block: { paddingLeft: number; paddingRight: number; paddingBottom: number };
};

export type GroundInsetOptions = {
  /**
   * `true` (default) — this panel is the screen's own bottom edge, so the
   * bottom clearance is the design padding, the home indicator and the
   * floating button's room. `false` — something else sits below it and clears
   * the inset itself (a `Dock`), so only the design padding is added.
   *
   * The mirror of `GroundPanel`'s own prop, which `scroll="own"` cannot honour
   * for the screen: the panel no longer carries a bottom at all, so a screen
   * that would have passed `clearBottom={false}` passes it here instead.
   */
  clearBottom?: boolean;
};

export function useGroundInset({ clearBottom = true }: GroundInsetOptions = {}): GroundInset {
  const insets = useSafeArea();
  const floatClearance = useFloatingClearance();

  const gutter = {
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };
  const bottom = clearBottom ? insets.bottom + floatClearance : 0;
  const withBottom = { ...gutter, paddingBottom: space.x5 + bottom };

  return { gutter, content: withBottom, block: withBottom };
}
