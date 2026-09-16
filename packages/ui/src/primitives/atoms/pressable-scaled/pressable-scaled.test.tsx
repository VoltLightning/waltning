/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PressableScaled } from "./pressable-scaled";

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
 * **Not covered here: the press itself.** `react-native-web`'s responder does
 * not engage under jsdom — no pointer sequence this file could fire reaches
 * `onPressIn` — so the scale's *behaviour* is left to the eye and to the
 * device. What is pinned above is the part that broke silently and that a test
 * can see: the style composition. Asserting a press that never happens would
 * be a test that asserts nothing.
 */
