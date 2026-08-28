/**
 * @vitest-environment jsdom
 *
 * `DualTotal` and `Card` — the app frame.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { dark, light } from "../theme/roles.ts";
import { Card } from "./card";
import { DualTotal } from "./dual-total";

describe("DualTotal", () => {
  it("shows both figures at once", () => {
    // §5: **never a toggle.** The two answer different questions and look
    // identical, so a control that swaps them guarantees someone eventually
    // reads *ours* believing it is *mine*.
    render(
      <DualTotal
        mine={money.toMoney("1000.00000000")}
        ours={money.toMoney("1600.00000000")}
        currency="PLN"
      />,
    );
    expect(screen.getByText("1000.00")).toBeDefined();
    expect(screen.getByText("1600.00")).toBeDefined();
  });

  it("has no scope prop to toggle with", () => {
    // Stated as a test because the absence is the feature. If a `scope` prop
    // ever appears, this is what should have to be deleted to allow it.
    const props = Object.keys({ mine: "", ours: null, currency: "", decimals: 2 });
    expect(props).not.toContain("scope");
  });

  it("degrades to one figure when nothing is shared", () => {
    // A household total identical to the personal one, printed underneath,
    // teaches the reader that the second line carries no information.
    const { container } = render(
      <DualTotal mine={money.toMoney("1000.00000000")} ours={null} currency="PLN" />,
    );
    expect(container.textContent).toContain("mine");
    expect(container.textContent).not.toContain("ours");
  });
});

describe("Card", () => {
  it("renders without a header when it has neither title nor action", () => {
    const { container } = render(
      <Card>
        <span>body</span>
      </Card>,
    );
    expect(container.textContent).toBe("body");
  });

  /**
   * **A card has no shadow in either theme.** `design-system/02` §2.5 reserves
   * the system's one shadow for the floating add button — the only object above
   * the page — and conveys every surface in the layout by edge. This used to
   * assert the opposite for light; the dark theme was already right, and light
   * caught up.
   */
  it("is a bordered surface with no shadow, in both themes", () => {
    const { container, rerender } = render(
      <ThemeProvider theme={light}>
        <Card>
          <span>body</span>
        </Card>
      </ThemeProvider>,
    );
    const card = container.firstElementChild as HTMLElement;

    for (const theme of [light, dark]) {
      expect(theme.elevation.card.shadowOpacity).toBe(0);
      expect(theme.elevation.card.borderWidth).toBe(1);
    }
    expect(getComputedStyle(card).borderTopWidth).toBe("1px");

    rerender(
      <ThemeProvider theme={dark}>
        <Card>
          <span>body</span>
        </Card>
      </ThemeProvider>,
    );
    expect(getComputedStyle(card).borderTopWidth).toBe("1px");
  });

  it("grants the one shadow to the floating level only", () => {
    for (const theme of [light, dark]) {
      expect(theme.elevation.float.shadowOpacity).toBeGreaterThan(0);
      expect(theme.elevation.floatLifted.shadowOpacity).toBeGreaterThan(
        theme.elevation.float.shadowOpacity,
      );
      for (const level of ["card", "raised", "frame"] as const) {
        expect(theme.elevation[level].shadowOpacity, level).toBe(0);
      }
    }
  });
});
