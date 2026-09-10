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
import { categoryRamp } from "../../../tokens.ts";
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
   * **A bar wears its category's tint, and the tint is the category's
   * everywhere.** Hue here is identity, not magnitude — length is magnitude,
   * and length still is. The same colour marks this bar, the row in the
   * ledger, and a report's slice, so a category is recognised without being
   * read.
   *
   * **Not `chartRamp`, which was tried and cannot do it.** Its steps are
   * measured against each other because they are segments of one stacked bar;
   * separate bars are each measured against the same track, so the largest
   * category came out at 2.19:1 in dark and the smallest at 8.68. That is a
   * property of a *sequential* ramp and it is why `categoryRamp` exists.
   */
  it("draws each category in its own tint, and the same one every time", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      key: `k${i}`,
      label: `Row ${i}`,
      amount: money.toMoney(`${60 - i * 10}.00`),
    }));
    const { rerender } = render(<SpendRows currency="PLN" rows={rows} />);
    const colourOf = (label: string) => {
      const track = screen.getByText(label).parentElement?.children[1];
      const fill = track?.firstElementChild;
      return fill instanceof HTMLElement ? fill.style.backgroundColor : "";
    };
    // Six labels do not have to land on six distinct steps — eight steps and a
    // hash means collisions, and a shared tint costs nothing. What must hold is
    // that more than one is in play, so this is a palette rather than a repaint
    // of the single colour it replaced.
    const colours = new Set(rows.map((row) => colourOf(row.label)));
    expect(colours.size).toBeGreaterThan(1);

    // **The ramp, not merely "some colours".** A test that only counted
    // distinct values passed with the bars painted `accentFill` — 1.03:1
    // against the track, an invisible bar — because the contrast assertions
    // live on the tokens and nothing tied the component to them.
    for (const drawn of colours) {
      expect(categoryRamp.map((step) => rgb(step.fill))).toContain(drawn);
    }

    // Stable across renders: a tint that moved on re-render would be a
    // category with no identity at all.
    const first = colourOf("Row 0");
    rerender(<SpendRows currency="PLN" rows={[...rows].reverse()} />);
    expect(colourOf("Row 0"), "the tint is the name's, not the row's position").toBe(first);
  });
});
