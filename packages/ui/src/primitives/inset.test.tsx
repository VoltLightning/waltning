/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { Inset } from "./inset";

function fill(row?: boolean) {
  const view = render(
    <ThemeProvider theme={light}>
      <Inset {...(row === undefined ? {} : { row })}>
        <span>Came in</span>
      </Inset>
    </ThemeProvider>,
  );
  const panel = view.getByText("Came in").parentElement;
  if (panel === null) throw new Error("Inset drew no panel");
  const style = getComputedStyle(panel);
  view.unmount();
  return style;
}

/**
 * **Its own fill, not the card's and not a control's.** The step exists
 * because reaching for `subtleFill` gets a fill tuned for a track, and nesting
 * a second `Card` gets a border where a group should have none.
 */
it("draws the inset fill", () => {
  expect(fill().backgroundColor).toBe("rgb(248, 244, 236)");
});

/** And no border — an inset is inside something that already has one. */
it("draws no border of its own", () => {
  expect(fill().borderTopWidth).toBe("0px");
});

/** The paired-figures shape: side by side, equal shares. */
it("lays a pair out in a row when asked", () => {
  expect(fill(true).flexDirection).toBe("row");
  expect(fill().flexDirection).toBe("column");
});
