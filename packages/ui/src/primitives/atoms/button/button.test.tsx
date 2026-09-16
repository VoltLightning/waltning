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

/** Every variant the type admits — widened by hand is how one slipped through. */
const VARIANTS = [
  "primary",
  "secondary",
  "ghost",
  "danger",
] as const satisfies readonly ButtonVariant[];

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

/**
 * **Every pair, not the two I happened to name.** The first version of this
 * compared `danger` against `ghost` only, and a fifth variant — `dangerQuiet`,
 * an outlined red — was added to `ButtonVariant` in the same PR and sailed
 * past it: byte-identical to the outlined variant filling `danger` had just
 * replaced, and mounted directly beside `secondary` at **1.0079:1**. The
 * compiler caught the two `satisfies Record<ButtonVariant, …>` maps and
 * nothing caught the test, because the test named its subjects.
 *
 * Weight is *(fill, edge)* — the pair that survives greyscale. Two variants
 * may share a hue; they may not share a shape.
 */
it("gives every variant a weight no other variant has", () => {
  const seen = new Map<string, ButtonVariant>();
  for (const variant of VARIANTS) {
    const { background, borderWidth } = box(variant);
    const weight = `${background} / ${borderWidth}`;
    const clash = seen.get(weight);
    expect(clash, `${variant} and ${clash} are the same object in two colours`).toBeUndefined();
    seen.set(weight, variant);
  }
});
