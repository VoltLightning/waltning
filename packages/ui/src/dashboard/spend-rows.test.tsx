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
import { light } from "../theme/roles.ts";
import { SpendRows } from "./spend-rows";

/** `getComputedStyle` reports a hex as `rgb(r, g, b)`; the token is a hex. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

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
   * **Every bar is the same colour.** The first version ranked into
   * `chartRamp`, whose steps are measured against each other because they are
   * segments of one stacked bar; separate bars are each measured against the
   * same track. Two of its five steps clear 3:1 in light and four do in dark —
   * from the *other* end, so the largest category's bar came out at 2.19:1
   * there and the smallest at 8.68:1. Length is the encoding.
   */
  it("draws every bar in the theme's chart-bar colour", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      key: `k${i}`,
      label: `Row ${i}`,
      amount: money.toMoney(`${60 - i * 10}.00`),
    }));
    render(<SpendRows currency="PLN" rows={rows} />);
    const colourOf = (label: string) => {
      const track = screen.getByText(label).parentElement?.children[1];
      const fill = track?.firstElementChild;
      return fill instanceof HTMLElement ? fill.style.backgroundColor : "";
    };
    const colours = new Set(rows.map((row) => colourOf(row.label)));
    expect(colours.size).toBe(1);
    // **The token, not merely "one colour".** A test that only counted
    // distinct colours passed with the bars painted `accentFill` — 1.03:1
    // against the track, an invisible bar — because the contrast assertion
    // lives on the token in `theme.test.tsx` and nothing tied the component to
    // it. Bound here, so the two cannot drift apart.
    expect([...colours][0]).toBe(rgb(light.chartBar));
  });
});
