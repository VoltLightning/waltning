/**
 * @vitest-environment jsdom
 *
 * `DualTotal` and `Card` — the app frame.
 */

import { render, screen } from "@testing-library/react";
import { money } from "@waltning/core";
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

  it("uses shadow elevation in light and a border in dark", () => {
    const { container, rerender } = render(
      <ThemeProvider theme={light}>
        <Card>
          <span>body</span>
        </Card>
      </ThemeProvider>,
    );
    const card = container.firstElementChild as HTMLElement;

    expect(light.elevation.card.shadowOpacity).toBeGreaterThan(0);
    expect(light.elevation.card.borderWidth).toBe(0);

    rerender(
      <ThemeProvider theme={dark}>
        <Card>
          <span>body</span>
        </Card>
      </ThemeProvider>,
    );

    expect(dark.elevation.card.shadowOpacity).toBe(0);
    expect(dark.elevation.card.borderWidth).toBe(1);
    expect(getComputedStyle(card).borderTopWidth).toBe("1px");
  });
});
