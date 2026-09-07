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

/** The two axes as the browser resolves them, whichever shorthand produced them. */
function overscroll(testID: string) {
  const style = getComputedStyle(screen.getByTestId(testID));
  return {
    x: style.getPropertyValue("overscroll-behavior-x"),
    y: style.getPropertyValue("overscroll-behavior-y"),
  };
}

describe("a bounded scroller contains its own overscroll", () => {
  it("contains both axes", () => {
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

  it("claims no Android nested scrolling, which a horizontal list does not implement", () => {
    expect(horizontalScrollProps({})).not.toHaveProperty("nestedScrollEnabled");
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
