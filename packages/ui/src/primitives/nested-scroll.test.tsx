/**
 * @vitest-environment jsdom
 *
 * **The containment is asserted where it has to be true: in the DOM.**
 *
 * Two rounds of this fix were enforced by reading source — first "does the
 * file mention the prop", then "does the element spread the helper" — and both
 * could be spelled around while the rendered page still chained to the screen
 * behind it. `tests/architecture.test.ts` still checks that every scroller
 * *declares* which kind it is, because a call site that forgets is the common
 * failure; but what a declaration is worth is measured here.
 */

import { render, screen } from "@testing-library/react";
import { ScrollView } from "react-native";
import { describe, expect, it } from "vitest";
import {
  containOverscroll,
  horizontalScrollProps,
  nestedScrollProps,
  pageScrollProps,
} from "./nested-scroll.ts";

/**
 * The two axes as they reach the DOM. `react-native-web` emits the longhands
 * itself, so this reads back what it wrote rather than resolving a shorthand —
 * what is measured is that the declaration survives the style pipeline onto
 * the element, not that a browser engine honours it. That last step is the
 * browser's own, and no test here can stand in for it.
 */
function overscroll(testID: string) {
  const style = getComputedStyle(screen.getByTestId(testID));
  return {
    x: style.getPropertyValue("overscroll-behavior-x"),
    y: style.getPropertyValue("overscroll-behavior-y"),
  };
}

describe("a bounded scroller contains the axis it scrolls", () => {
  /**
   * Both axes. The cross axis is `overflow-x: hidden` — a scroll container with
   * nothing of its own to scroll — so what is contained there is taken from
   * what is above, and on the web that is the browser's horizontal
   * back-gesture. A sideways swipe on a picker should not navigate away.
   */
  it("contains both axes — its own travel, and the browser's back-gesture", () => {
    render(<ScrollView testID="bounded" {...nestedScrollProps({ flex: 1 })} />);
    expect(overscroll("bounded")).toEqual({ x: "contain", y: "contain" });
  });

  it("keeps the style it was given", () => {
    render(<ScrollView testID="bounded" {...nestedScrollProps({ paddingLeft: 7 })} />);
    // The helper takes the style precisely so containment and layout cannot be
    // separated; a call site passing its style elsewhere would lose one of them.
    expect(getComputedStyle(screen.getByTestId("bounded")).paddingLeft).toBe("7px");
    expect(overscroll("bounded").y).toBe("contain");
  });

  it("is what BottomSheet's body spreads directly", () => {
    render(<ScrollView testID="sheet-body" style={containOverscroll} />);
    expect(overscroll("sheet-body")).toEqual({ x: "contain", y: "contain" });
  });
});

/**
 * A horizontal chip row rides inside something that scrolls vertically — a
 * sheet body, a page. `react-native-web` expands `overscrollBehavior` to both
 * axes and gives a horizontal `ScrollView` `overflow-y: hidden`, which still
 * makes it a scroll container: containing `y` there would swallow a vertical
 * drag that begins on the row, and the sheet under it would not move.
 */
describe("a horizontal scroller contains its own axis and no more", () => {
  it("contains x and leaves y alone", () => {
    render(<ScrollView horizontal testID="row" {...horizontalScrollProps({ gap: 8 })} />);
    const { x, y } = overscroll("row");
    expect(x).toBe("contain");
    expect(y).not.toBe("contain");
  });

  it("keeps the Android half, which a horizontal list does implement", () => {
    // `ReactHorizontalScrollViewManager` declares `@ReactProp("nestedScrollEnabled")`
    // exactly as the vertical manager does. An earlier version of this helper
    // dropped the prop on the stated grounds that it did nothing there, which
    // was simply false about this repository's own React Native.
    expect(horizontalScrollProps({}).nestedScrollEnabled).toBe(true);
    expect(nestedScrollProps({}).nestedScrollEnabled).toBe(true);
  });
});

describe("a page scroller", () => {
  it("contains nothing — there is nothing behind it to chain into", () => {
    render(<ScrollView testID="page" {...pageScrollProps({ flex: 1 })} />);
    const { x, y } = overscroll("page");
    expect(x).not.toBe("contain");
    expect(y).not.toBe("contain");
  });

  it("draws no indicator", () => {
    render(<ScrollView testID="page" {...pageScrollProps({ flex: 1 })} />);
    expect(getComputedStyle(screen.getByTestId("page")).scrollbarWidth).toBe("none");
  });
});
