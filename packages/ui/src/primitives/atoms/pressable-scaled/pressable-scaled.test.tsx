/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { usePressScale } from "../../press-scale.ts";
import { PressableScaled } from "./pressable-scaled";

const scaleIn = vi.fn();
const scaleOut = vi.fn();
vi.mock("../../press-scale.ts", () => ({ usePressScale: vi.fn() }));

vi.mocked(usePressScale).mockReturnValue({
  style: {},
  onPressIn: scaleIn,
  onPressOut: scaleOut,
});

/** Hoisted, because a JSX prop takes a named reference (the repo-wide rule). */
const sized = () => [{ width: 28, height: 28 }];

/**
 * **The bug this file exists for.** `createAnimatedComponent` does not invoke
 * `Pressable`'s function style — it hands the function to the style prop, and
 * everything it returns is dropped. `IconButton` takes its width and height
 * from one, so every arrow and glyph in the app collapsed to the size of its
 * content and forty visual baselines moved. Nothing in the unit suite saw it,
 * because the tests that cover `IconButton` assert colours rather than boxes.
 */
it("applies a function style, which the animated component alone would drop", () => {
  render(
    <PressableScaled
      accessibilityRole="button"
      accessibilityLabel="stepper"
      onPress={vi.fn()}
      style={sized}
    />,
  );
  const style = getComputedStyle(screen.getByRole("button", { name: "stepper" }));
  expect(style.width).toBe("28px");
  expect(style.height).toBe("28px");
});

/** An object style is the common case and must survive the composition too. */
it("applies an object style", () => {
  render(
    <PressableScaled
      accessibilityRole="button"
      accessibilityLabel="row"
      onPress={vi.fn()}
      style={{ width: 44 }}
    />,
  );
  expect(getComputedStyle(screen.getByRole("button", { name: "row" })).width).toBe("44px");
});

/**
 * **The press itself, which an earlier version of this file claimed was
 * unreachable.** The commit that added this component said *"react-native-web's
 * responder does not engage under jsdom"* — it does, on the mouse path: a
 * `mouseDown`/`mouseUp` pair drives `onPressIn` and `onPressOut`. Without this,
 * every assertion here was about the *element name*, and the whole press
 * feedback could be deleted from the component with the suite still green —
 * the defect this PR exists to fix, relocated into one file where it was again
 * invisible.
 */
it("drives the scale on press, in and out", () => {
  render(<PressableScaled accessibilityRole="button" accessibilityLabel="tap" onPress={vi.fn()} />);
  const el = screen.getByRole("button", { name: "tap" });
  fireEvent.mouseDown(el, { button: 0, buttons: 1 });
  fireEvent.mouseUp(el, { button: 0 });
  expect(scaleIn).toHaveBeenCalled();
  expect(scaleOut).toHaveBeenCalled();
});

/**
 * **Not covered here: the mid-press frame.** `react-native-web`'s responder does
 * not engage under jsdom — no pointer sequence this file could fire reaches
 * `onPressIn` — so the scale's *behaviour* is left to the eye and to the
 * device. What is pinned above is the part that broke silently and that a test
 * can see: the style composition. Asserting a press that never happens would
 * be a test that asserts nothing.
 */
