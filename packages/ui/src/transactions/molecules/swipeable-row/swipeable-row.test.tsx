/**
 * @vitest-environment jsdom
 *
 * `SwipeableRow` — the gesture itself is inert under Vitest
 * (`.vitest/gesture-handler.ts`'s own doc: "a drag is looked at in Storybook
 * and on the device"). What this proves is the one thing that survives that
 * stand-in: the row renders its child undisturbed, and never calls either
 * callback on its own.
 */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { describe, expect, it, vi } from "vitest";
// **The stub's own type, not the library's.** `vitest.config.ts` aliases the
// real module to this one; `tsc` does not, so typing against the library
// would hide the recorded fields the assertions below are about.
import type { PanBuilder } from "../../../../.vitest/gesture-handler.ts";
import { SwipeableRow } from "./swipeable-row";

describe("SwipeableRow", () => {
  it("renders its child", () => {
    render(
      <SwipeableRow onShortSwipe={vi.fn()} onLongSwipe={vi.fn()}>
        <Text>Corner Bakery</Text>
      </SwipeableRow>,
    );
    expect(screen.getByText("Corner Bakery")).toBeDefined();
  });

  it("never fires either callback on mount alone", () => {
    const onShortSwipe = vi.fn();
    const onLongSwipe = vi.fn();
    render(
      <SwipeableRow onShortSwipe={onShortSwipe} onLongSwipe={onLongSwipe}>
        <Text>Row</Text>
      </SwipeableRow>,
    );
    expect(onShortSwipe).not.toHaveBeenCalled();
    expect(onLongSwipe).not.toHaveBeenCalled();
  });
});

/**
 * **The axes, asserted — because inverting them passed everything.**
 *
 * These rows cover most of a screen whose list scrolls the other way, and a
 * pan told only a minimum distance claims every gesture in any direction: the
 * list could not be scrolled from a row at all. The fix is which axis the pan
 * owns and which it gives back, and until this test the fix was verified by
 * nothing — swapping `activeOffsetX` for `activeOffsetY` was green.
 */
describe("the axis this gesture owns", () => {
  function pan() {
    const built: PanBuilder[] = [];
    const real = Gesture.Pan;
    vi.spyOn(Gesture, "Pan").mockImplementation(() => {
      const builder = real() as unknown as PanBuilder;
      built.push(builder);
      return builder as unknown as ReturnType<typeof Gesture.Pan>;
    });
    render(
      <SwipeableRow onShortSwipe={vi.fn()} onLongSwipe={vi.fn()}>
        <Text>a row</Text>
      </SwipeableRow>,
    );
    vi.mocked(Gesture.Pan).mockRestore();
    const first = built[0];
    if (first === undefined) throw new Error("no pan was built");
    return first;
  }

  it("activates sideways and fails downward", () => {
    const built = pan();
    expect(built.activeOffsetXValue, "it owns the horizontal axis").not.toBeNull();
    expect(built.failOffsetYValue, "and gives up the vertical one").not.toBeNull();
    expect(built.activeOffsetYValue, "never the other way round").toBeNull();
    expect(built.failOffsetXValue).toBeNull();
  });

  it("gives ties to the list, which is the gesture made constantly", () => {
    // S04 §7: "with the sideways threshold the larger of the two, so the
    // gesture a reader makes constantly wins ties over the one they make
    // rarely". Whichever axis passes its threshold first wins.
    const built = pan();
    const sideways = Math.abs(Number([built.activeOffsetXValue].flat()[0]));
    const vertical = Math.abs(Number([built.failOffsetYValue].flat()[0]));
    expect(sideways).toBeGreaterThan(vertical);
  });
});
