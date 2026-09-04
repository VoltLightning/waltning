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
import { describe, expect, it, vi } from "vitest";
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
