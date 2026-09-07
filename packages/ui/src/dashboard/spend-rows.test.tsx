/**
 * @vitest-environment jsdom
 *
 * The three decisions this component makes on its own: what a bar is a
 * proportion *of*, what a non-positive bucket looks like, and where the ramp
 * runs out.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { SpendRows } from "./spend-rows";

function widthOf(label: string): string {
  const row = screen.getByText(label).parentElement;
  // label · track · figure — the fill is the track's only child.
  const track = row?.children[1];
  const fill = track?.firstElementChild;
  return fill instanceof HTMLElement ? fill.style.width : "";
}

describe("SpendRows", () => {
  /**
   * **Proportional to the widest row, not to the total.** A share of the total
   * is what the stacked bar already says; here the comparison that matters is
   * between the rows on screen, and scaling to the total leaves every bar
   * short and the differences between them small.
   */
  it("gives the largest row the full track and the rest their share of it", () => {
    render(
      <SpendRows
        currency="PLN"
        rows={[
          { key: "a", label: "Groceries", amount: money.toMoney("100.00") },
          { key: "b", label: "Home", amount: money.toMoney("25.00") },
        ]}
      />,
    );
    expect(widthOf("Groceries")).toBe("100%");
    expect(widthOf("Home")).toBe("25%");
  });

  /**
   * A legal split can carry a discount line, so a bucket can come back
   * negative. `SpendByCategoryWidget` states the same rule: the figure is a
   * fact, the bar is nothing.
   */
  it("draws no bar for a non-positive amount, and still states the figure", () => {
    render(
      <SpendRows
        currency="PLN"
        rows={[
          { key: "a", label: "Groceries", amount: money.toMoney("100.00") },
          { key: "b", label: "Refunds", amount: money.toMoney("-80.00") },
        ]}
      />,
    );
    expect(widthOf("Refunds")).toBe("0%");
    expect(document.body.textContent).toContain("80.00");
  });

  /** Every row zero: no bar is a proportion of nothing, and nothing divides by zero. */
  it("draws no bars at all when every row is zero", () => {
    render(
      <SpendRows
        currency="PLN"
        rows={[
          { key: "a", label: "Groceries", amount: money.ZERO },
          { key: "b", label: "Home", amount: money.ZERO },
        ]}
      />,
    );
    expect(widthOf("Groceries")).toBe("0%");
    expect(widthOf("Home")).toBe("0%");
  });

  /**
   * The ramp has five steps and the fold gives at most seven rows, so the last
   * two share the palest one rather than reading `undefined` and falling back
   * to the accent — which would put a *brand* colour in a chart.
   */
  it("clamps to the ramp's last step rather than running past it", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`,
      label: `Row ${i}`,
      amount: money.toMoney("10.00"),
    }));
    render(<SpendRows currency="PLN" rows={rows} />);
    const colourOf = (label: string) => {
      const track = screen.getByText(label).parentElement?.children[1];
      const fill = track?.firstElementChild;
      return fill instanceof HTMLElement ? fill.style.backgroundColor : "";
    };
    expect(colourOf("Row 6")).toBe(colourOf("Row 4"));
    expect(colourOf("Row 0")).not.toBe(colourOf("Row 4"));
  });
});
