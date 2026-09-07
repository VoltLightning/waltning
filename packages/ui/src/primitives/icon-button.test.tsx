/**
 * @vitest-environment jsdom
 *
 * The two grounds an icon button sits on, and why they cannot share a fill.
 */

import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { IconButton } from "./icon-button";

function fillWhileHovered(tone: "ground" | "shell"): string {
  // Its own tree, unmounted after: two renders in one document give two
  // buttons and `getByRole` refuses the ambiguity.
  const view = render(
    <ThemeProvider theme={light}>
      <IconButton label="Appearance" onPress={vi.fn()} tone={tone}>
        <span>glyph</span>
      </IconButton>
    </ThemeProvider>,
  );
  const button = view.getByRole("button");
  fireEvent.pointerEnter(button);
  const fill = getComputedStyle(button).backgroundColor;
  view.unmount();
  return fill;
}

/**
 * **The shell's hover is an alpha overlay, never a ground fill.** `hoverFill`
 * is a cream: painted behind a `shellText` glyph on the sage band it leaves it
 * at 1.10:1, a control that vanishes under a pointer. `button.tsx` guards the
 * same hazard for its `primary` variant. Asserted as *which token*, because
 * the ratio itself is unreachable from jsdom — nothing here paints.
 */
it("hovers on the shell with the shell's own overlay, not the ground's fill", () => {
  const shell = fillWhileHovered("shell");
  expect(shell).toBe("rgba(255, 255, 255, 0.1)");
  expect(shell).not.toBe(fillWhileHovered("ground"));
});

/** The default is unchanged — every other icon button in the system sits on a card. */
it("hovers on the ground with the ground's fill", () => {
  expect(fillWhileHovered("ground")).toBe("rgb(236, 229, 215)");
});

/**
 * **The ring on the band, asserted where it renders.** `theme.test.tsx` proves
 * `shellFocusRing` clears 3:1 on `shell` — a property of two hex strings, which
 * cannot notice this control going back to the green one. The whole ring fix
 * was deletable with the suite green, the same shape as the `tone` prop that
 * shipped unasserted a round earlier.
 */
it("focuses with the ring of the ground it is on", () => {
  for (const [tone, expected] of [
    ["shell", "rgb(242, 240, 231)"],
    ["ground", "rgb(100, 129, 92)"],
  ] as const) {
    const view = render(
      <ThemeProvider theme={light}>
        <IconButton label="Appearance" onPress={vi.fn()} tone={tone}>
          <span>glyph</span>
        </IconButton>
      </ThemeProvider>,
    );
    const button = view.getByRole("button");
    fireEvent.focusIn(button);
    expect(getComputedStyle(button).outlineColor, tone).toBe(expected);
    view.unmount();
  }
});
