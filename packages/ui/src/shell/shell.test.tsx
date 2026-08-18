/**
 * @vitest-environment jsdom
 *
 * `DualTotal` and `Card` — the app frame.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";
import { DualTotal } from "./dual-total";

describe("DualTotal", () => {
  it("shows both figures at once", () => {
    // §5: **never a toggle.** The two answer different questions and look
    // identical, so a control that swaps them guarantees someone eventually
    // reads *ours* believing it is *mine*.
    render(<DualTotal mine="1000.00000000" ours="1600.00000000" currency="PLN" />);
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
    const { container } = render(<DualTotal mine="1000.00000000" ours={null} currency="PLN" />);
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
});
