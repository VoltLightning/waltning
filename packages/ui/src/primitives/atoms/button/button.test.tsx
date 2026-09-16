/**
 * @vitest-environment jsdom
 *
 * **The weight rule, which is the whole of §2.6c.** A destructive control and
 * the escape beside it must differ in more than hue: `danger` was an outlined
 * red button standing next to an outlined grey one, which is one object in two
 * colours and no separation at all in a greyscale screenshot. These assert the
 * separation survives — a fill on one, no fill on the other — rather than
 * asserting the two hex values, which would only restate the stylesheet.
 */

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { Button, type ButtonVariant } from "./button";

function box(variant: ButtonVariant) {
  const { unmount } = render(
    <ThemeProvider theme={light}>
      <Button label={variant} onPress={vi.fn()} variant={variant} />
    </ThemeProvider>,
  );
  const style = getComputedStyle(screen.getByRole("button", { name: variant }));
  const read = {
    background: style.backgroundColor,
    borderWidth: style.borderTopWidth,
  };
  unmount();
  return read;
}

it("gives a destructive action a fill, so it outweighs the escape rather than only recolouring it", () => {
  const danger = box("danger");
  expect(danger.background).not.toBe("");
  expect(danger.background).not.toBe("rgba(0, 0, 0, 0)");
});

it("leaves the escape without one — a ghost has no fill and no edge to match it", () => {
  const ghost = box("ghost");
  expect(ghost.background === "" || ghost.background === "rgba(0, 0, 0, 0)").toBe(true);
  expect(ghost.borderWidth === "" || ghost.borderWidth === "0px").toBe(true);
});

/** The two never collapse to the same weight, whatever either hue becomes. */
it("never draws the destructive control and the escape as the same object", () => {
  expect(box("danger").background).not.toBe(box("ghost").background);
});
